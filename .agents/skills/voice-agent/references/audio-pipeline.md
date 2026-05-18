# Audio Pipeline Reference

## Audio Format

All internal audio is **16kHz, 16-bit, mono PCM**. This is the universal format understood by:
- webrtcvad (VAD requires 8/16/32/48 kHz)
- faster-whisper (expects 16kHz float32)
- Deepgram (supports linear16 at 16kHz)
- ElevenLabs (outputs pcm_16000)

## VAD Parameters

| Parameter | Default | Effect |
|---|---|---|
| `aggressiveness` | 2 | 0=least aggressive, 3=most. Higher = more silence classified as non-speech |
| `speech_frames` | 6 | Consecutive voiced frames to trigger SPEAKING (~180ms) |
| `silence_frames` | 15 | Consecutive unvoiced frames to trigger SILENCE (~450ms) |
| `pre_speech_ms` | 300 | Audio kept before speech onset (avoids clipping first syllable) |

## Frame Sizes

| Rate | Duration | Bytes (16-bit mono) |
|---|---|---|
| 16kHz | 10ms | 320 |
| 16kHz | 20ms | 640 |
| 16kHz | 30ms | 960 ← **default** |

## WASAPI Loopback (Windows)

PyAudioWPatch extends PyAudio with `isLoopbackDevice` flag. The loopback device mirrors the default speaker output, allowing capture of system audio without any driver hacks.

Requirements:
- Windows 10/11
- PyAudioWPatch (not plain PyAudio)
- Default audio output must be active

## Latency Budget

| Stage | Target | Notes |
|---|---|---|
| VAD detection | < 50ms | webrtcvad processes 30ms frames |
| STT (local) | 200-500ms | faster-whisper with int8 quantization |
| STT (cloud) | 300-800ms | Deepgram Nova-2 streaming |
| Atrium processing | 100-500ms | Depends on LLM model |
| TTS (local) | 200-400ms | Piper ONNX inference |
| TTS (cloud) | 300-600ms | ElevenLabs streaming (first chunk) |
| **Total (local)** | **~1s** | Acceptable for conversation |
| **Total (cloud)** | **~1.5s** | Still conversational |
