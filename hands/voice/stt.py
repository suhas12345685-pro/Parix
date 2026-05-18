"""Speech-to-Text — convert audio to text.

Backends:
  1. faster-whisper (local, offline, fast via CTranslate2)
  2. deepgram (cloud, real-time streaming)
  3. whisper.cpp (local fallback)

All backends conform to the STTProvider protocol.
"""

from __future__ import annotations

import logging
import tempfile
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import AsyncIterator

import numpy as np

log = logging.getLogger("parix.voice.stt")


@dataclass
class Transcript:
    text: str
    language: str | None = None
    confidence: float = 0.0
    duration_ms: int = 0


class STTProvider(ABC):
    @abstractmethod
    def transcribe(self, pcm_16k_mono: bytes) -> Transcript:
        """Transcribe 16kHz 16-bit mono PCM audio."""
        ...

    @abstractmethod
    def is_available(self) -> bool: ...


class FasterWhisperSTT(STTProvider):
    """Local STT via faster-whisper (CTranslate2 optimized Whisper)."""

    def __init__(
        self,
        model_size: str = "base.en",
        device: str = "auto",
        compute_type: str = "int8",
    ):
        self._model_size = model_size
        self._device = device
        self._compute_type = compute_type
        self._model = None

    def _ensure_model(self):
        if self._model is None:
            from faster_whisper import WhisperModel
            self._model = WhisperModel(
                self._model_size,
                device=self._device,
                compute_type=self._compute_type,
            )
            log.info("Loaded faster-whisper model: %s", self._model_size)

    def transcribe(self, pcm_16k_mono: bytes) -> Transcript:
        self._ensure_model()
        t0 = time.time()

        audio = np.frombuffer(pcm_16k_mono, dtype=np.int16).astype(np.float32) / 32768.0
        segments, info = self._model.transcribe(
            audio,
            beam_size=5,
            language=None,
            vad_filter=True,
        )

        text_parts = []
        for seg in segments:
            text_parts.append(seg.text.strip())

        text = " ".join(text_parts)
        elapsed = int((time.time() - t0) * 1000)

        return Transcript(
            text=text,
            language=info.language if info else None,
            confidence=round(info.language_probability, 2) if info else 0.0,
            duration_ms=elapsed,
        )

    def is_available(self) -> bool:
        try:
            import faster_whisper
            return True
        except ImportError:
            return False


class DeepgramSTT(STTProvider):
    """Cloud STT via Deepgram Nova-2."""

    def __init__(self, api_key: str | None = None, model: str = "nova-2"):
        import os
        self._api_key = api_key or os.environ.get("DEEPGRAM_API_KEY", "")
        self._model = model

    def transcribe(self, pcm_16k_mono: bytes) -> Transcript:
        import json
        import urllib.request

        t0 = time.time()
        url = f"https://api.deepgram.com/v1/listen?model={self._model}&encoding=linear16&sample_rate=16000&channels=1"

        req = urllib.request.Request(
            url,
            data=pcm_16k_mono,
            headers={
                "Authorization": f"Token {self._api_key}",
                "Content-Type": "application/octet-stream",
            },
            method="POST",
        )

        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read())

        alt = result["results"]["channels"][0]["alternatives"][0]
        elapsed = int((time.time() - t0) * 1000)

        return Transcript(
            text=alt.get("transcript", ""),
            language=result["results"].get("channels", [{}])[0].get("detected_language"),
            confidence=round(alt.get("confidence", 0.0), 2),
            duration_ms=elapsed,
        )

    def is_available(self) -> bool:
        return bool(self._api_key)


def create_stt(prefer: str = "auto") -> STTProvider:
    """Create the best available STT provider.

    prefer: "local", "cloud", or "auto" (try local first, fall back to cloud).
    """
    local = FasterWhisperSTT()
    cloud = DeepgramSTT()

    if prefer == "local" and local.is_available():
        return local
    if prefer == "cloud" and cloud.is_available():
        return cloud

    if local.is_available():
        log.info("Using local STT (faster-whisper)")
        return local
    if cloud.is_available():
        log.info("Using cloud STT (Deepgram)")
        return cloud

    raise RuntimeError(
        "No STT backend available. Install faster-whisper (pip install faster-whisper) "
        "or set DEEPGRAM_API_KEY for cloud STT."
    )
