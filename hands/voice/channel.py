"""Voice Channel — bridge between voice conversation and Parix channel system.

Integrates with:
  1. Aegis client — direct speech-to-speech through the dashboard
  2. Synapse WebSocket — voice events flow to Atrium
  3. Channel router — agent can speak responses through voice channel
  4. Meeting/call mode — listen via loopback, speak via TTS

Protocol messages:
  VOICE_INPUT   → from Hands to Atrium (transcribed user speech)
  VOICE_OUTPUT  → from Atrium to Hands (agent response text to speak)
  VOICE_STATE   → from Hands to Atrium (session state changes)
  VOICE_CONTROL → from Atrium/Aegis to Hands (start/stop/pause/mode)
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from typing import Any

import websockets

from hands.voice.conversation import (
    ConversationConfig,
    ConversationMode,
    VoiceConversation,
)

log = logging.getLogger("parix.voice.channel")

SYNAPSE_URL = "ws://localhost:8765"


@dataclass
class VoiceChannelState:
    active: bool = False
    mode: str = "direct"
    muted: bool = False
    stt_backend: str = "unknown"
    tts_backend: str = "unknown"


class VoiceChannel:
    """Manages voice as a Parix communication channel.

    Handles the lifecycle of voice conversations and bridges them
    to the Synapse WebSocket for Atrium processing.
    """

    def __init__(self, synapse_url: str = SYNAPSE_URL):
        self._synapse_url = synapse_url
        self._conversation: VoiceConversation | None = None
        self._ws = None
        self._state = VoiceChannelState()
        self._running = False

    async def start(self, mode: str = "direct", stt: str = "auto", tts: str = "auto") -> None:
        mode_map = {
            "direct": ConversationMode.DIRECT,
            "loopback": ConversationMode.LOOPBACK,
            "duplex": ConversationMode.DUPLEX,
            "meeting": ConversationMode.LOOPBACK,
            "call": ConversationMode.DUPLEX,
        }
        conv_mode = mode_map.get(mode, ConversationMode.DIRECT)

        config = ConversationConfig(
            mode=conv_mode,
            stt_prefer=stt,
            tts_prefer=tts,
        )

        self._conversation = VoiceConversation(
            config=config,
            on_user_speech=self._on_user_speech,
            on_agent_response=self._on_agent_response,
            send_to_atrium=self._send_to_atrium_sync,
        )

        self._conversation.start()
        self._state.active = True
        self._state.mode = mode
        self._running = True

        await self._emit_state("started")
        log.info("Voice channel started (mode=%s)", mode)

    def _on_user_speech(self, text: str) -> None:
        """Callback when user speech is transcribed."""
        log.info("User said: %s", text[:100])

    def _on_agent_response(self, text: str) -> None:
        """Callback when agent speaks."""
        log.info("Agent said: %s", text[:100])

    def _send_to_atrium_sync(self, msg: dict) -> None:
        """Synchronous wrapper to send voice events to Atrium via Synapse."""
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.ensure_future(self._send_to_atrium(msg))
            else:
                loop.run_until_complete(self._send_to_atrium(msg))
        except RuntimeError:
            loop = asyncio.new_event_loop()
            loop.run_until_complete(self._send_to_atrium(msg))

    async def _send_to_atrium(self, msg: dict) -> None:
        """Send a message to Atrium through Synapse WebSocket."""
        try:
            async with websockets.connect(self._synapse_url) as ws:
                await ws.send(json.dumps(msg))
        except Exception as e:
            log.warning("Failed to send voice event to Atrium: %s", e)

    async def _emit_state(self, event: str) -> None:
        """Emit a voice state change event."""
        msg = {
            "type": "VOICE_STATE",
            "event": event,
            "state": {
                "active": self._state.active,
                "mode": self._state.mode,
                "muted": self._state.muted,
            },
            "timestamp": time.time(),
        }
        await self._send_to_atrium(msg)

    async def handle_control(self, payload: dict) -> dict:
        """Handle VOICE_CONTROL messages from Atrium/Aegis.

        Commands: start, stop, pause, resume, speak, mode, mute, unmute
        """
        command = payload.get("command", "")
        result: dict[str, Any] = {"success": True, "command": command}

        if command == "start":
            mode = payload.get("mode", "direct")
            stt = payload.get("stt", "auto")
            tts = payload.get("tts", "auto")
            await self.start(mode=mode, stt=stt, tts=tts)

        elif command == "stop":
            await self.stop()

        elif command == "pause":
            if self._conversation:
                self._conversation.pause()
                self._state.muted = True
                await self._emit_state("paused")

        elif command == "resume":
            if self._conversation:
                self._conversation.resume()
                self._state.muted = False
                await self._emit_state("resumed")

        elif command == "speak":
            text = payload.get("text", "")
            if self._conversation and text:
                self._conversation.speak(text)
            else:
                result["success"] = False
                result["error"] = "No active conversation or empty text"

        elif command == "mode":
            new_mode = payload.get("mode", "direct")
            await self.stop()
            await self.start(mode=new_mode)

        else:
            result["success"] = False
            result["error"] = f"Unknown command: {command}"

        return result

    async def handle_voice_output(self, payload: dict) -> None:
        """Handle VOICE_OUTPUT messages — agent wants to speak."""
        text = payload.get("text", "")
        if self._conversation and text:
            self._conversation.speak(text)

    async def stop(self) -> None:
        if self._conversation:
            self._conversation.stop()
            self._conversation = None
        self._state.active = False
        self._running = False
        await self._emit_state("stopped")
        log.info("Voice channel stopped")

    @property
    def state(self) -> VoiceChannelState:
        return self._state

    @property
    def history(self) -> list:
        if self._conversation:
            return self._conversation.history
        return []
