"""Mirror of shared/protocol.json as Python dataclasses."""

from dataclasses import dataclass, field
from typing import Any


SYNAPSE_PORT = 8765
AEGIS_RELAY_PORT = 8766
NEUROSYMBOLIC_IPC_PORT = 8771
ACK_TIMEOUT_MS = 200
LLM_TIMEOUT_MS = 10000

RECONNECT_MAX_RETRIES = 5
RECONNECT_BASE_DELAY_MS = 500
RECONNECT_MAX_DELAY_MS = 16000


@dataclass
class TaskRequest:
    task_id: str
    type: str
    payload: dict[str, Any] = field(default_factory=dict)
    timestamp: float = 0.0


@dataclass
class TaskAck:
    task_id: str
    status: str
    timestamp: float = 0.0


@dataclass
class TaskResult:
    task_id: str
    success: bool
    output: str = ""
    error: str | None = None
    timestamp: float = 0.0


@dataclass
class SensorEvent:
    event_type: str
    data: dict[str, Any] = field(default_factory=dict)
    confidence: float = 0.0
    timestamp: float = 0.0


@dataclass
class SilentIntentEvent:
    intent_type: str
    data: dict[str, Any] = field(default_factory=dict)
    confidence: float = 0.5
    timestamp: float = 0.0


@dataclass
class Heartbeat:
    timestamp: float = 0.0


@dataclass
class RebootSync:
    timestamp: float = 0.0


@dataclass
class WorldStatePush:
    last_task: str | None = None
    active_state: str = "IDLE"
    timestamp: float = 0.0


@dataclass
class CapabilityMissing:
    missing: str = ""
    message: str = ""
    timestamp: float = 0.0


@dataclass
class AccessibilitySnapshotEvent:
    """Wire form of an accessibility snapshot — see hands/accessibility/types.py.

    `summary` is the compact form produced by `AccessibilitySnapshot.summarize()`
    (focused element + a shallow window around it). Atrium persists this and
    feeds the focused element into working memory.
    """

    snapshot_id: str
    focused_app: str
    backend_used: str
    tree_summary: dict[str, Any] = field(default_factory=dict)
    confidence: float = 0.0
    timestamp: float = 0.0


@dataclass
class VisionOcrRequest:
    request_id: str
    prompt: str
    image_b64: str
    mime_type: str = "image/png"
    timestamp: float = 0.0


@dataclass
class VisionOcrResponse:
    request_id: str
    text: str = ""
    error: str | None = None
    timestamp: float = 0.0


@dataclass
class SynapseAuth:
    token: str
    timestamp: float = 0.0


@dataclass
class SynapseAuthOk:
    timestamp: float = 0.0


@dataclass
class SynapseAuthError:
    reason: str
    timestamp: float = 0.0


@dataclass
class ErrorMsg:
    task_id: str | None = None
    code: str = ""
    message: str = ""
    timestamp: float = 0.0


@dataclass
class VoiceInput:
    text: str = ""
    mode: str = "direct"
    timestamp: float = 0.0


@dataclass
class VoiceOutput:
    text: str = ""
    timestamp: float = 0.0


@dataclass
class VoiceState:
    event: str = ""
    state: dict[str, Any] = field(default_factory=dict)
    timestamp: float = 0.0


@dataclass
class VoiceControl:
    command: str = ""
    mode: str = "direct"
    text: str = ""
    stt: str = "auto"
    tts: str = "auto"
    timestamp: float = 0.0
