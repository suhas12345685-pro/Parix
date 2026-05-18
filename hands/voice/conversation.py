"""Real-time speech-to-speech conversation loop.

The core loop:
  1. Mic → VAD detects speech → buffer audio
  2. VAD detects silence → send buffer to STT
  3. STT text → Synapse → Atrium (agent processes) → response text
  4. Response text → TTS → Speaker output
  5. Repeat

Supports two modes:
  - DIRECT: mic + speaker (local conversation with user)
  - LOOPBACK: system audio capture (listen to meetings/calls)
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Any, Callable

log = logging.getLogger("parix.voice.conversation")


class ConversationMode(Enum):
    DIRECT = auto()     # Mic input → agent → speaker output
    LOOPBACK = auto()   # System audio → agent listens (meeting mode)
    DUPLEX = auto()     # Both mic + loopback (call mode: hear + speak)


@dataclass
class ConversationConfig:
    mode: ConversationMode = ConversationMode.DIRECT
    stt_prefer: str = "auto"
    tts_prefer: str = "auto"
    vad_aggressiveness: int = 2
    silence_timeout_ms: int = 1500
    max_listen_ms: int = 30_000
    auto_respond: bool = True
    language: str | None = None


@dataclass
class Utterance:
    text: str
    speaker: str  # "user", "agent", "other" (meeting participant)
    timestamp: float = 0.0
    confidence: float = 0.0


class VoiceConversation:
    """Manages a real-time speech conversation session."""

    def __init__(
        self,
        config: ConversationConfig | None = None,
        on_user_speech: Callable[[str], None] | None = None,
        on_agent_response: Callable[[str], None] | None = None,
        send_to_atrium: Callable[[dict], Any] | None = None,
    ):
        self._config = config or ConversationConfig()
        self._on_user_speech = on_user_speech
        self._on_agent_response = on_agent_response
        self._send_to_atrium = send_to_atrium

        self._running = False
        self._paused = False
        self._history: list[Utterance] = []
        self._mic = None
        self._loopback = None
        self._speaker = None
        self._stt = None
        self._tts = None
        self._vad = None
        self._speech_buffer = None
        self._thread: threading.Thread | None = None

    def _init_components(self):
        from hands.voice.audio_io import MicStream, LoopbackStream, Speaker
        from hands.voice.vad import VoiceActivityDetector, SpeechBuffer
        from hands.voice.stt import create_stt
        from hands.voice.tts import create_tts

        self._stt = create_stt(self._config.stt_prefer)
        self._tts = create_tts(self._config.tts_prefer)
        self._vad = VoiceActivityDetector(aggressiveness=self._config.vad_aggressiveness)
        self._speech_buffer = SpeechBuffer(self._vad)
        self._speaker = Speaker()

        mode = self._config.mode
        if mode in (ConversationMode.DIRECT, ConversationMode.DUPLEX):
            self._mic = MicStream()
            self._mic.start()

        if mode in (ConversationMode.LOOPBACK, ConversationMode.DUPLEX):
            self._loopback = LoopbackStream()
            try:
                self._loopback.start()
            except RuntimeError as e:
                log.warning("Loopback unavailable: %s", e)
                self._loopback = None

    def start(self) -> None:
        if self._running:
            return
        self._init_components()
        self._running = True
        self._thread = threading.Thread(target=self._listen_loop, daemon=True, name="voice-conv")
        self._thread.start()
        log.info("Voice conversation started (mode=%s)", self._config.mode.name)

    def _listen_loop(self):
        while self._running:
            if self._paused:
                time.sleep(0.1)
                continue

            source = self._mic or self._loopback
            if source is None:
                time.sleep(0.1)
                continue

            chunk = source.read(timeout=0.1)
            if chunk is None:
                continue

            utterance_pcm = self._speech_buffer.feed(chunk)
            if utterance_pcm is not None:
                self._handle_utterance(utterance_pcm)

    def _handle_utterance(self, pcm: bytes):
        min_bytes = 16_000 * 2 * 0.3  # 300ms minimum
        if len(pcm) < min_bytes:
            return

        transcript = self._stt.transcribe(pcm)

        if not transcript.text.strip():
            return

        speaker = "user" if self._mic else "other"
        utterance = Utterance(
            text=transcript.text.strip(),
            speaker=speaker,
            timestamp=time.time(),
            confidence=transcript.confidence,
        )
        self._history.append(utterance)

        log.info("[%s] %s (conf=%.2f)", speaker, transcript.text, transcript.confidence)

        if self._on_user_speech:
            self._on_user_speech(transcript.text)

        if self._config.auto_respond and self._send_to_atrium:
            self._request_response(transcript.text)

    def _request_response(self, user_text: str):
        """Send transcribed text to Atrium for agent processing."""
        msg = {
            "type": "VOICE_INPUT",
            "text": user_text,
            "mode": self._config.mode.name.lower(),
            "timestamp": time.time(),
        }
        if self._send_to_atrium:
            self._send_to_atrium(msg)

    def speak(self, text: str) -> None:
        """Agent speaks — convert text to audio and play."""
        if not self._tts or not self._speaker:
            log.warning("TTS or speaker not initialized")
            return

        self._history.append(Utterance(
            text=text, speaker="agent", timestamp=time.time(), confidence=1.0,
        ))

        log.info("[agent] %s", text)

        if self._on_agent_response:
            self._on_agent_response(text)

        try:
            self._speaker.play_chunks(self._tts.stream(text))
        except Exception:
            pcm = self._tts.synthesize(text)
            self._speaker.play(pcm)

    def pause(self) -> None:
        self._paused = True
        log.info("Voice conversation paused")

    def resume(self) -> None:
        self._paused = False
        log.info("Voice conversation resumed")

    def stop(self) -> None:
        self._running = False

        remaining = self._speech_buffer.flush() if self._speech_buffer else None
        if remaining:
            self._handle_utterance(remaining)

        if self._mic:
            self._mic.close()
        if self._loopback:
            self._loopback.close()
        if self._speaker:
            self._speaker.close()

        self._mic = None
        self._loopback = None
        self._speaker = None
        log.info("Voice conversation stopped")

    @property
    def history(self) -> list[Utterance]:
        return list(self._history)

    @property
    def is_running(self) -> bool:
        return self._running

    @property
    def is_paused(self) -> bool:
        return self._paused
