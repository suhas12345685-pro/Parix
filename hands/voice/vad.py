"""Voice Activity Detection — detect when the user is speaking vs silent.

Uses webrtcvad for fast, low-latency detection with a ring buffer
to avoid cutting off speech at boundaries.
"""

from __future__ import annotations

import collections
import logging
from enum import Enum, auto

log = logging.getLogger("parix.voice.vad")

RATE = 16_000
FRAME_DURATION_MS = 30
FRAME_SIZE = int(RATE * FRAME_DURATION_MS / 1000) * 2  # 16-bit PCM bytes


class SpeechState(Enum):
    SILENCE = auto()
    SPEAKING = auto()


class VoiceActivityDetector:
    """Wraps webrtcvad with a ring buffer for smooth speech boundary detection.

    Args:
        aggressiveness: 0-3, higher = more aggressive filtering of non-speech.
        speech_frames: consecutive voiced frames to trigger SPEAKING.
        silence_frames: consecutive unvoiced frames to trigger SILENCE.
    """

    def __init__(
        self,
        aggressiveness: int = 2,
        speech_frames: int = 6,
        silence_frames: int = 15,
    ):
        import webrtcvad
        self._vad = webrtcvad.Vad(aggressiveness)
        self._speech_threshold = speech_frames
        self._silence_threshold = silence_frames
        self._ring = collections.deque(maxlen=max(speech_frames, silence_frames))
        self._state = SpeechState.SILENCE
        self._rate = RATE

    @property
    def state(self) -> SpeechState:
        return self._state

    def process_frame(self, frame: bytes) -> SpeechState:
        """Process a single audio frame and return current speech state.

        Frame must be exactly FRAME_DURATION_MS of 16kHz 16-bit mono PCM.
        """
        if len(frame) != FRAME_SIZE:
            return self._state

        is_speech = self._vad.is_speech(frame, self._rate)
        self._ring.append(is_speech)

        if self._state == SpeechState.SILENCE:
            voiced = sum(1 for x in self._ring if x)
            if voiced >= self._speech_threshold:
                self._state = SpeechState.SPEAKING
                log.debug("VAD: SILENCE → SPEAKING")
        else:
            unvoiced = sum(1 for x in self._ring if not x)
            if unvoiced >= self._silence_threshold:
                self._state = SpeechState.SILENCE
                log.debug("VAD: SPEAKING → SILENCE")

        return self._state

    def process_chunk(self, pcm_data: bytes) -> list[tuple[SpeechState, int]]:
        """Process a larger audio chunk, returning state transitions with byte offsets."""
        transitions: list[tuple[SpeechState, int]] = []
        prev_state = self._state

        for i in range(0, len(pcm_data) - FRAME_SIZE + 1, FRAME_SIZE):
            frame = pcm_data[i : i + FRAME_SIZE]
            new_state = self.process_frame(frame)
            if new_state != prev_state:
                transitions.append((new_state, i))
                prev_state = new_state

        return transitions

    def reset(self) -> None:
        self._ring.clear()
        self._state = SpeechState.SILENCE


class SpeechBuffer:
    """Accumulates audio while speaking, yields complete utterances on silence."""

    def __init__(self, vad: VoiceActivityDetector, pre_speech_ms: int = 300):
        self._vad = vad
        self._pre_speech_frames = int(pre_speech_ms / FRAME_DURATION_MS)
        self._pre_ring: collections.deque[bytes] = collections.deque(
            maxlen=self._pre_speech_frames
        )
        self._speech_chunks: list[bytes] = []
        self._is_collecting = False

    def feed(self, pcm_data: bytes) -> bytes | None:
        """Feed audio data, returns complete utterance PCM when speech ends.

        Returns None while still collecting or during silence.
        """
        for i in range(0, len(pcm_data) - FRAME_SIZE + 1, FRAME_SIZE):
            frame = pcm_data[i : i + FRAME_SIZE]
            prev_state = self._vad.state
            new_state = self._vad.process_frame(frame)

            if not self._is_collecting:
                self._pre_ring.append(frame)

                if new_state == SpeechState.SPEAKING:
                    self._is_collecting = True
                    self._speech_chunks = list(self._pre_ring)
                    self._speech_chunks.append(frame)
            else:
                self._speech_chunks.append(frame)

                if new_state == SpeechState.SILENCE:
                    utterance = b"".join(self._speech_chunks)
                    self._speech_chunks = []
                    self._is_collecting = False
                    self._pre_ring.clear()
                    return utterance

        return None

    def flush(self) -> bytes | None:
        """Force-flush any accumulated speech (e.g., on shutdown)."""
        if self._speech_chunks:
            utterance = b"".join(self._speech_chunks)
            self._speech_chunks = []
            self._is_collecting = False
            return utterance
        return None

    def reset(self) -> None:
        self._vad.reset()
        self._pre_ring.clear()
        self._speech_chunks = []
        self._is_collecting = False
