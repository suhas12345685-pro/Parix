"""Text-to-Speech — convert agent responses to audio.

Backends:
  1. piper-tts (local, offline, fast neural TTS)
  2. elevenlabs (cloud, high-quality, streaming)
  3. pyttsx3 (local fallback, lower quality)

All backends conform to the TTSProvider protocol.
"""

from __future__ import annotations

import io
import logging
import os
import struct
import subprocess
import tempfile
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

log = logging.getLogger("parix.voice.tts")


@dataclass
class AudioChunk:
    pcm_data: bytes
    rate: int = 16_000
    is_final: bool = False


class TTSProvider(ABC):
    @abstractmethod
    def synthesize(self, text: str) -> bytes:
        """Synthesize text to 16kHz 16-bit mono PCM."""
        ...

    def stream(self, text: str) -> Iterator[AudioChunk]:
        """Stream audio chunks as they're generated. Default: single chunk."""
        pcm = self.synthesize(text)
        yield AudioChunk(pcm_data=pcm, rate=16_000, is_final=True)

    @abstractmethod
    def is_available(self) -> bool: ...


class PiperTTS(TTSProvider):
    """Local TTS via piper-tts (ONNX neural voices)."""

    def __init__(self, model: str | None = None, voice: str = "en_US-lessac-medium"):
        self._model = model
        self._voice = voice

    def synthesize(self, text: str) -> bytes:
        try:
            from piper import PiperVoice

            if self._model:
                voice = PiperVoice.load(self._model)
            else:
                voice = PiperVoice.load(self._voice)

            buf = io.BytesIO()
            import wave
            with wave.open(buf, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(22050)
                voice.synthesize(text, wf)

            buf.seek(0)
            with wave.open(buf, "rb") as wf:
                pcm = wf.readframes(wf.getnframes())

            return self._resample(pcm, 22050, 16000)
        except ImportError:
            return self._synthesize_cli(text)

    def _synthesize_cli(self, text: str) -> bytes:
        """Fallback: use piper CLI if Python bindings aren't installed."""
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            out_path = f.name

        try:
            proc = subprocess.run(
                ["piper", "--model", self._voice, "--output_file", out_path],
                input=text.encode(),
                capture_output=True,
                timeout=30,
            )
            if proc.returncode != 0:
                raise RuntimeError(f"piper CLI failed: {proc.stderr.decode()}")

            import wave
            with wave.open(out_path, "rb") as wf:
                pcm = wf.readframes(wf.getnframes())
                rate = wf.getframerate()

            return self._resample(pcm, rate, 16000)
        finally:
            Path(out_path).unlink(missing_ok=True)

    @staticmethod
    def _resample(pcm: bytes, from_rate: int, to_rate: int) -> bytes:
        if from_rate == to_rate:
            return pcm
        import numpy as np
        samples = np.frombuffer(pcm, dtype=np.int16).astype(np.float32)
        ratio = to_rate / from_rate
        new_len = int(len(samples) * ratio)
        indices = np.linspace(0, len(samples) - 1, new_len)
        resampled = np.interp(indices, np.arange(len(samples)), samples)
        return resampled.astype(np.int16).tobytes()

    def is_available(self) -> bool:
        try:
            import piper
            return True
        except ImportError:
            import shutil
            return shutil.which("piper") is not None


class ElevenLabsTTS(TTSProvider):
    """Cloud TTS via ElevenLabs streaming API."""

    def __init__(
        self,
        api_key: str | None = None,
        voice_id: str = "21m00Tcm4TlvDq8ikWAM",  # Rachel
        model_id: str = "eleven_turbo_v2_5",
    ):
        self._api_key = api_key or os.environ.get("ELEVENLABS_API_KEY", "")
        self._voice_id = voice_id
        self._model_id = model_id

    def synthesize(self, text: str) -> bytes:
        chunks = list(self.stream(text))
        return b"".join(c.pcm_data for c in chunks)

    def stream(self, text: str) -> Iterator[AudioChunk]:
        import json
        import urllib.request

        url = f"https://api.elevenlabs.io/v1/text-to-speech/{self._voice_id}/stream"
        body = json.dumps({
            "text": text,
            "model_id": self._model_id,
            "output_format": "pcm_16000",
        }).encode()

        req = urllib.request.Request(
            url,
            data=body,
            headers={
                "xi-api-key": self._api_key,
                "Content-Type": "application/json",
                "Accept": "audio/pcm",
            },
        )

        with urllib.request.urlopen(req, timeout=30) as resp:
            while True:
                chunk = resp.read(4096)
                if not chunk:
                    break
                yield AudioChunk(pcm_data=chunk, rate=16_000, is_final=False)
        yield AudioChunk(pcm_data=b"", rate=16_000, is_final=True)

    def is_available(self) -> bool:
        return bool(self._api_key)


class Pyttsx3TTS(TTSProvider):
    """Fallback local TTS via pyttsx3 (SAPI5/espeak/nsss)."""

    def __init__(self, rate: int = 175):
        self._rate = rate

    def synthesize(self, text: str) -> bytes:
        import pyttsx3

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            out_path = f.name

        try:
            engine = pyttsx3.init()
            engine.setProperty("rate", self._rate)
            engine.save_to_file(text, out_path)
            engine.runAndWait()

            import wave
            with wave.open(out_path, "rb") as wf:
                pcm = wf.readframes(wf.getnframes())
                rate = wf.getframerate()

            return PiperTTS._resample(pcm, rate, 16000)
        finally:
            Path(out_path).unlink(missing_ok=True)

    def is_available(self) -> bool:
        try:
            import pyttsx3
            return True
        except ImportError:
            return False


def create_tts(prefer: str = "auto") -> TTSProvider:
    """Create the best available TTS provider.

    prefer: "local", "cloud", or "auto" (try local first, fall back to cloud).
    """
    piper = PiperTTS()
    eleven = ElevenLabsTTS()
    fallback = Pyttsx3TTS()

    if prefer == "local":
        if piper.is_available():
            return piper
        if fallback.is_available():
            return fallback
    if prefer == "cloud" and eleven.is_available():
        return eleven

    if piper.is_available():
        log.info("Using local TTS (piper)")
        return piper
    if eleven.is_available():
        log.info("Using cloud TTS (ElevenLabs)")
        return eleven
    if fallback.is_available():
        log.info("Using fallback TTS (pyttsx3)")
        return fallback

    raise RuntimeError(
        "No TTS backend available. Install piper-tts (pip install piper-tts), "
        "set ELEVENLABS_API_KEY, or install pyttsx3."
    )
