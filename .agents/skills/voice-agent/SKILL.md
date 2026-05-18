---
name: voice-agent
description: Real-time speech-to-speech voice — talk to the agent, listen in meetings, speak in calls. Mic + WASAPI loopback + STT + TTS.
---

# Voice Agent — Real-Time Speech-to-Speech

> Use when the agent needs to talk and listen in real time — direct conversation, meeting participation, or phone calls through channels.

## Conversation Modes

| Mode | Input | Output | Use Case |
|---|---|---|---|
| `direct` | Microphone | Speaker | Talk to agent at your desk |
| `loopback` | System audio (WASAPI) | — | Listen to meetings silently |
| `duplex` | Mic + system audio | Speaker | Active call participation |
| `meeting` | Alias for loopback | — | Meeting transcription |
| `call` | Alias for duplex | Speaker | Phone/video call mode |

## Usage

```python
from hands.voice.channel import VoiceChannel

# Start voice channel
vc = VoiceChannel()
await vc.start(mode="direct")      # Talk to agent
await vc.start(mode="meeting")     # Listen to meeting
await vc.start(mode="call")        # Full call mode

# Agent speaks
vc._conversation.speak("I've found the bug. It's in line 42.")

# Control
await vc.handle_control({"command": "pause"})
await vc.handle_control({"command": "resume"})
await vc.handle_control({"command": "speak", "text": "Hello!"})
await vc.stop()
```

## Pipeline

```
┌──────────┐    ┌─────┐    ┌─────┐    ┌─────────┐    ┌─────┐    ┌─────────┐
│ Mic /    │───>│ VAD │───>│ STT │───>│ Synapse │───>│ LLM │───>│ TTS +   │
│ Loopback │    │     │    │     │    │ → Atrium│    │     │    │ Speaker │
└──────────┘    └─────┘    └─────┘    └─────────┘    └─────┘    └─────────┘
   audio        speech     text        WebSocket     response     audio
   16kHz        detect     transcript  relay          text         playback
```

## STT Backends (Speech → Text)

| Backend | Type | Speed | Quality | Requirements |
|---|---|---|---|---|
| `faster-whisper` | Local | Fast | High | `pip install faster-whisper` |
| `deepgram` | Cloud | Real-time | Very High | `DEEPGRAM_API_KEY` |

## TTS Backends (Text → Speech)

| Backend | Type | Speed | Quality | Requirements |
|---|---|---|---|---|
| `piper-tts` | Local | Fast | Good | `pip install piper-tts` |
| `elevenlabs` | Cloud | Streaming | Excellent | `ELEVENLABS_API_KEY` |
| `pyttsx3` | Local | Instant | Basic | `pip install pyttsx3` (fallback) |

## Protocol Messages

| Message | Direction | Purpose |
|---|---|---|
| `VOICE_INPUT` | Hands → Atrium | Transcribed user speech |
| `VOICE_OUTPUT` | Atrium → Hands | Agent response to speak |
| `VOICE_STATE` | Hands → Atrium | Session state changes |
| `VOICE_CONTROL` | Atrium → Hands | Start/stop/pause/mode commands |

## Channel Integration

The voice channel plugs into the Parix channel router. When the agent decides to respond:
1. Atrium sends `VOICE_OUTPUT` through Synapse
2. Hands receives it in `VoiceChannel.handle_voice_output()`
3. TTS converts text to audio
4. Speaker plays the audio

For calls via apps ("call X on Y"):
1. Agent opens the app via computer-use skill
2. Switches voice to `duplex` mode
3. WASAPI loopback captures call audio → STT → agent understands
4. Agent responds via TTS → speaker output → call hears the agent

## Dependencies

| Package | Purpose | Install |
|---|---|---|
| `PyAudioWPatch` | Audio I/O + WASAPI loopback | `pip install PyAudioWPatch` |
| `webrtcvad` | Voice activity detection | `pip install webrtcvad` |
| `faster-whisper` | Local STT | `pip install faster-whisper` |
| `numpy` | Audio processing | `pip install numpy` |
| `piper-tts` | Local TTS (optional) | `pip install piper-tts` |
| `pyttsx3` | Fallback TTS (optional) | `pip install pyttsx3` |

## Key Files

- `hands/voice/audio_io.py` — MicStream, LoopbackStream, Speaker
- `hands/voice/vad.py` — VoiceActivityDetector, SpeechBuffer
- `hands/voice/stt.py` — FasterWhisperSTT, DeepgramSTT
- `hands/voice/tts.py` — PiperTTS, ElevenLabsTTS, Pyttsx3TTS
- `hands/voice/conversation.py` — VoiceConversation loop
- `hands/voice/channel.py` — VoiceChannel (Synapse integration)
