"""Audio I/O via PyAudioWPatch — mic capture and speaker playback.

Supports two modes:
  1. Mic input  → record user's voice
  2. WASAPI loopback → capture system audio (meetings, calls)
  3. Speaker output → play TTS audio
"""

from __future__ import annotations

import logging
import queue
import threading
import time
from typing import Any, Callable

import numpy as np

log = logging.getLogger("parix.voice.io")

RATE = 16_000
CHANNELS = 1
CHUNK = 1024
FORMAT_WIDTH = 2  # 16-bit PCM = 2 bytes


def _get_pyaudio():
    try:
        import pyaudiowpatch as paw
        return paw
    except ImportError:
        import pyaudio
        return pyaudio


class MicStream:
    """Captures audio from the default microphone."""

    def __init__(self, rate: int = RATE, chunk: int = CHUNK, device_index: int | None = None):
        self._pa = _get_pyaudio()
        self._p = self._pa.PyAudio()
        self._rate = rate
        self._chunk = chunk
        self._device_index = device_index
        self._stream = None
        self._running = False
        self._buffer: queue.Queue[bytes] = queue.Queue(maxsize=200)

    def start(self) -> None:
        kwargs: dict[str, Any] = {
            "format": self._p.get_format_from_width(FORMAT_WIDTH),
            "channels": CHANNELS,
            "rate": self._rate,
            "input": True,
            "frames_per_buffer": self._chunk,
            "stream_callback": self._callback,
        }
        if self._device_index is not None:
            kwargs["input_device_index"] = self._device_index
        self._stream = self._p.open(**kwargs)
        self._running = True
        self._stream.start_stream()
        log.info("Mic stream started (rate=%d, chunk=%d)", self._rate, self._chunk)

    def _callback(self, in_data, frame_count, time_info, status):
        pa = _get_pyaudio()
        if self._running and in_data:
            try:
                self._buffer.put_nowait(in_data)
            except queue.Full:
                self._buffer.get_nowait()
                self._buffer.put_nowait(in_data)
        return (None, pa.paContinue)

    def read(self, timeout: float = 0.1) -> bytes | None:
        try:
            return self._buffer.get(timeout=timeout)
        except queue.Empty:
            return None

    def read_all(self) -> bytes:
        chunks = []
        while not self._buffer.empty():
            try:
                chunks.append(self._buffer.get_nowait())
            except queue.Empty:
                break
        return b"".join(chunks)

    def stop(self) -> None:
        self._running = False
        if self._stream:
            self._stream.stop_stream()
            self._stream.close()
        log.info("Mic stream stopped")

    def close(self) -> None:
        self.stop()
        self._p.terminate()


class LoopbackStream:
    """Captures system audio via WASAPI loopback (Windows only).

    Useful for listening to meetings, calls, or any audio the user hears.
    """

    def __init__(self, rate: int = RATE, chunk: int = CHUNK):
        self._pa = _get_pyaudio()
        self._p = self._pa.PyAudio()
        self._rate = rate
        self._chunk = chunk
        self._stream = None
        self._running = False
        self._buffer: queue.Queue[bytes] = queue.Queue(maxsize=200)

    def _find_loopback_device(self) -> dict | None:
        try:
            wasapi_info = self._p.get_host_api_info_by_type(self._pa.paWASAPI)
        except Exception:
            log.warning("WASAPI not available — loopback capture disabled")
            return None

        default_speakers = self._p.get_device_info_by_index(
            wasapi_info["defaultOutputDevice"]
        )

        for i in range(self._p.get_device_count()):
            dev = self._p.get_device_info_by_index(i)
            if (dev.get("isLoopbackDevice", False)
                    and dev["name"].startswith(default_speakers["name"].split(" (")[0])):
                return dev
        return None

    def start(self) -> None:
        loopback = self._find_loopback_device()
        if loopback is None:
            raise RuntimeError("No WASAPI loopback device found. Install PyAudioWPatch on Windows.")

        self._stream = self._p.open(
            format=self._p.get_format_from_width(FORMAT_WIDTH),
            channels=int(loopback["maxInputChannels"]),
            rate=int(loopback["defaultSampleRate"]),
            input=True,
            input_device_index=loopback["index"],
            frames_per_buffer=self._chunk,
            stream_callback=self._callback,
        )
        self._running = True
        self._stream.start_stream()
        log.info("Loopback stream started (device=%s)", loopback["name"])

    def _callback(self, in_data, frame_count, time_info, status):
        pa = _get_pyaudio()
        if self._running and in_data:
            try:
                self._buffer.put_nowait(in_data)
            except queue.Full:
                self._buffer.get_nowait()
                self._buffer.put_nowait(in_data)
        return (None, pa.paContinue)

    def read(self, timeout: float = 0.1) -> bytes | None:
        try:
            return self._buffer.get(timeout=timeout)
        except queue.Empty:
            return None

    def stop(self) -> None:
        self._running = False
        if self._stream:
            self._stream.stop_stream()
            self._stream.close()
        log.info("Loopback stream stopped")

    def close(self) -> None:
        self.stop()
        self._p.terminate()


class Speaker:
    """Plays PCM audio through the default speaker."""

    def __init__(self, rate: int = RATE):
        self._pa = _get_pyaudio()
        self._p = self._pa.PyAudio()
        self._rate = rate
        self._stream = None
        self._lock = threading.Lock()

    def play(self, pcm_data: bytes, rate: int | None = None) -> None:
        rate = rate or self._rate
        with self._lock:
            stream = self._p.open(
                format=self._p.get_format_from_width(FORMAT_WIDTH),
                channels=CHANNELS,
                rate=rate,
                output=True,
            )
            stream.write(pcm_data)
            stream.stop_stream()
            stream.close()

    def play_chunks(self, chunk_iter, rate: int | None = None) -> None:
        """Stream audio chunks as they arrive (for real-time TTS)."""
        rate = rate or self._rate
        with self._lock:
            stream = self._p.open(
                format=self._p.get_format_from_width(FORMAT_WIDTH),
                channels=CHANNELS,
                rate=rate,
                output=True,
            )
            for chunk in chunk_iter:
                if chunk:
                    stream.write(chunk)
            stream.stop_stream()
            stream.close()

    def close(self) -> None:
        self._p.terminate()


def pcm_to_numpy(pcm: bytes, dtype=np.int16) -> np.ndarray:
    return np.frombuffer(pcm, dtype=dtype)


def numpy_to_pcm(arr: np.ndarray) -> bytes:
    return arr.astype(np.int16).tobytes()


def compute_rms(pcm: bytes) -> float:
    arr = pcm_to_numpy(pcm).astype(np.float32)
    if len(arr) == 0:
        return 0.0
    return float(np.sqrt(np.mean(arr ** 2)))
