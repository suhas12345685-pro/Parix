import asyncio
import json
import logging
import os
import secrets
import signal
import sys
import threading
import time
from collections import deque
from dataclasses import dataclass

import websockets

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [HANDS] %(levelname)s %(message)s",
)
logger = logging.getLogger("hands")

try:
    from hands.protocol import SYNAPSE_PORT
except ImportError:
    from protocol import SYNAPSE_PORT
try:
    from hands.auth.token import load_or_create_token
except ImportError:
    from auth.token import load_or_create_token
try:
    from hands.sensors.shadow_loop import start_shadow_thread
except ImportError:
    from sensors.shadow_loop import start_shadow_thread
try:
    from hands.sensors.watcher import watch_loop as watcher_loop
except ImportError:
    from sensors.watcher import watch_loop as watcher_loop
try:
    from hands.sensors.hotkey_watch import start_hotkey_listener
except ImportError:
    from sensors.hotkey_watch import start_hotkey_listener
try:
    from hands.sensors.a11y_poller import run_loop as a11y_poller_loop
except ImportError:
    from sensors.a11y_poller import run_loop as a11y_poller_loop
try:
    from hands.neurosymbolic.sidecar import serve as neurosymbolic_sidecar_loop
except ImportError:
    try:
        from neurosymbolic.sidecar import serve as neurosymbolic_sidecar_loop
    except ImportError:
        neurosymbolic_sidecar_loop = None
try:
    from hands.executor.cli import execute as cli_execute
    from hands.executor.vision import execute as vision_execute
except ImportError:
    from executor.cli import execute as cli_execute
    from executor.vision import execute as vision_execute

try:
    from hands.voice.channel import VoiceChannel
except ImportError:
    try:
        from voice.channel import VoiceChannel
    except ImportError:
        VoiceChannel = None

HOST = os.getenv("PARIX_WS_HOST", "localhost")
PORT = int(os.getenv("PARIX_WS_PORT", str(SYNAPSE_PORT)))
SENSOR_RELAY_BUFFER_SIZE = int(os.getenv("PARIX_SENSOR_RELAY_BUFFER_SIZE", "100"))
ALLOW_REMOTE_SYNAPSE = os.getenv("PARIX_ALLOW_REMOTE_SYNAPSE", "").strip().lower() in (
    "1",
    "true",
    "yes",
)
AUTH_HANDSHAKE_TIMEOUT_S = float(os.getenv("PARIX_AUTH_HANDSHAKE_TIMEOUT_S", "5.0"))
LOOPBACK_HOSTS = {"127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost", ""}
LOCALHOST_BIND_HOSTS = {"localhost", "127.0.0.1", "::1", "0:0:0:0:0:0:0:1"}

bridge_connection = None
main_loop = None
shutdown_event = asyncio.Event()
voice_channel = VoiceChannel() if VoiceChannel else None
synapse_token: str | None = None
authenticated_connections: set = set()


SYNAPSE_AUTH = "SYNAPSE_AUTH"
SYNAPSE_AUTH_OK = "SYNAPSE_AUTH_OK"
SYNAPSE_AUTH_ERROR = "SYNAPSE_AUTH_ERROR"


def _is_loopback_peer(peer) -> bool:
    if not peer:
        return True
    host = peer[0] if isinstance(peer, tuple) else str(peer)
    return host in LOOPBACK_HOSTS


def _is_localhost_bind(host: str) -> bool:
    return host.lower() in LOCALHOST_BIND_HOSTS


def _enforce_bind_policy() -> None:
    if _is_localhost_bind(HOST):
        return
    if ALLOW_REMOTE_SYNAPSE:
        logger.warning(
            "Synapse bound to non-loopback host %s (PARIX_ALLOW_REMOTE_SYNAPSE=1). "
            "Non-loopback peers must present a valid PARIX_SYNAPSE_TOKEN.",
            HOST,
        )
        return
    raise SystemExit(
        f"Refusing to bind synapse to non-loopback host '{HOST}'. "
        f"Set PARIX_ALLOW_REMOTE_SYNAPSE=1 if this is intentional (and configure "
        f"PARIX_SYNAPSE_TOKEN so remote atrium clients can authenticate)."
    )

ATRIUM_MESSAGE_TYPES = {
    "TASK_REQUEST",
    "HEARTBEAT",
    "WORLD_STATE_PUSH",
    "CAPABILITY_MISSING",
    "VOICE_OUTPUT",
    "VOICE_CONTROL",
}

SENSOR_MESSAGE_TYPES = {
    "SENSOR_EVENT",
    "SILENT_INTENT_EVENT",
    "ACCESSIBILITY_SNAPSHOT",
}

BUFFERED_SENSOR_MESSAGE_TYPES = {
    "SENSOR_EVENT",
    "SILENT_INTENT_EVENT",
}

MULTIMODAL_REQUEST = "MULTIMODAL_REQUEST"
MULTIMODAL_RESPONSE = "MULTIMODAL_RESPONSE"


@dataclass
class Message:
    type: str
    data: dict

    def to_json(self) -> str:
        return json.dumps({"type": self.type, **self.data})


class TokenBucket:
    def __init__(self, capacity: int, refill_per_second: int) -> None:
        self.capacity = float(capacity)
        self.refill_per_second = float(refill_per_second)
        self.tokens = float(capacity)
        self.last_refill = time.monotonic()

    def try_remove(self, cost: int) -> bool:
        self._refill()
        if cost > self.tokens:
            return False
        self.tokens -= cost
        return True

    def _refill(self) -> None:
        now = time.monotonic()
        elapsed = max(0.0, now - self.last_refill)
        if elapsed <= 0:
            return
        self.tokens = min(
            self.capacity,
            self.tokens + elapsed * self.refill_per_second,
        )
        self.last_refill = now


sensor_relay_buffer = deque(maxlen=SENSOR_RELAY_BUFFER_SIZE)
multimodal_requesters = {}
# Internal MULTIMODAL futures for in-process consumers (the screen operator),
# keyed by request_id. Distinct from multimodal_requesters, which relays to a
# separate sensor websocket.
operator_multimodal_pending: dict = {}
# Only one operator loop may run at a time — overlapping loops fight over the
# same screen. Holds the in-flight asyncio.Task while an operate request runs.
active_operator_task = None
sensor_ingress_bucket = TokenBucket(
    capacity=int(os.getenv("PARIX_SENSOR_TOKEN_BUCKET", "64000")),
    refill_per_second=int(os.getenv("PARIX_SENSOR_REFILL_PER_SEC", "16000")),
)


def estimate_token_cost(raw: str) -> int:
    return max(1, len(raw) // 4)


def buffer_sensor_event(raw: str, msg_type: str) -> None:
    sensor_relay_buffer.append(raw)
    logger.info(
        "Buffered %s for Atrium replay (%d/%d)",
        msg_type,
        len(sensor_relay_buffer),
        SENSOR_RELAY_BUFFER_SIZE,
    )


async def replay_sensor_buffer(ws) -> None:
    replayed = 0
    while sensor_relay_buffer:
        raw = sensor_relay_buffer[0]
        await ws.send(raw)
        sensor_relay_buffer.popleft()
        replayed += 1

    if replayed:
        logger.info("Replayed %d buffered sensor event(s) to Atrium", replayed)


async def send_multimodal_error(ws, request_id: str, error: str) -> None:
    response = Message(
        MULTIMODAL_RESPONSE,
        {
            "request_id": request_id,
            "text": "",
            "error": error,
            "timestamp": time.time(),
        },
    )
    await ws.send(response.to_json())


async def handle_multimodal_request(ws, raw: str, msg: dict) -> None:
    request_id = msg.get("request_id")
    if not request_id:
        logger.warning("MULTIMODAL_REQUEST missing request_id")
        return

    if bridge_connection is None or bridge_connection == ws:
        await send_multimodal_error(ws, request_id, "no_atrium_connection")
        return

    multimodal_requesters[request_id] = ws
    try:
        await bridge_connection.send(raw)
        logger.info("Relayed MULTIMODAL_REQUEST %s to Atrium", request_id)
    except websockets.ConnectionClosed:
        logger.warning("Atrium disconnected while relaying MULTIMODAL_REQUEST")
        multimodal_requesters.pop(request_id, None)
        await send_multimodal_error(ws, request_id, "atrium_disconnected")


async def handle_multimodal_response(raw: str, msg: dict) -> None:
    request_id = msg.get("request_id")
    if not request_id:
        logger.warning("MULTIMODAL_RESPONSE missing request_id")
        return

    # In-process consumer (screen operator) waiting on this request?
    future = operator_multimodal_pending.get(request_id)
    if future is not None:
        if not future.done():
            future.set_result(
                {"text": msg.get("text", ""), "error": msg.get("error")}
            )
        return

    requester = multimodal_requesters.pop(request_id, None)
    if requester is None:
        logger.warning("No requester waiting for MULTIMODAL_RESPONSE %s", request_id)
        return

    try:
        await requester.send(raw)
        logger.info("Relayed MULTIMODAL_RESPONSE %s to requester", request_id)
    except websockets.ConnectionClosed:
        logger.warning("Requester disconnected before MULTIMODAL_RESPONSE %s", request_id)


async def fail_pending_multimodal_requests(error: str) -> None:
    # Resolve any in-process operator waiters so the loop unblocks instead of
    # hanging on a dead atrium connection.
    for request_id, future in list(operator_multimodal_pending.items()):
        operator_multimodal_pending.pop(request_id, None)
        if not future.done():
            future.set_result({"text": "", "error": error})

    pending = list(multimodal_requesters.items())
    multimodal_requesters.clear()
    for request_id, requester in pending:
        try:
            await send_multimodal_error(requester, request_id, error)
        except websockets.ConnectionClosed:
            logger.warning("Requester disconnected before MULTIMODAL error %s", request_id)


async def handle_message(ws, raw: str):
    global bridge_connection

    try:
        msg = json.loads(raw)
    except json.JSONDecodeError:
        logger.error("Malformed message: %s", raw[:200])
        return

    msg_type = msg.get("type")
    logger.info("Received: %s", msg_type)

    if msg_type == MULTIMODAL_REQUEST:
        await handle_multimodal_request(ws, raw, msg)
        return

    if msg_type == MULTIMODAL_RESPONSE:
        if ws != bridge_connection:
            logger.warning("Ignoring MULTIMODAL_RESPONSE from non-Atrium client")
            return
        await handle_multimodal_response(raw, msg)
        return

    if msg_type in ATRIUM_MESSAGE_TYPES and bridge_connection is None:
        bridge_connection = ws
        reboot = Message("REBOOT_SYNC", {"timestamp": time.time()})
        await ws.send(reboot.to_json())
        logger.info("Atrium registered and sent REBOOT_SYNC")
        await replay_sensor_buffer(ws)

    if msg_type == "TASK_REQUEST":
        task_id = msg.get("task_id")
        ack = Message("TASK_ACK", {
            "task_id": task_id,
            "status": "received",
            "timestamp": time.time(),
        })
        await ws.send(ack.to_json())
        logger.info("Sent ACK for task %s", task_id)

        task_type = msg.get("task_type", msg.get("type", "unknown"))
        if task_type == "operate":
            global active_operator_task
            if active_operator_task is not None and not active_operator_task.done():
                await ws.send(Message("TASK_RESULT", {
                    "task_id": task_id,
                    "success": False,
                    "output": "",
                    "error": "operator busy — another operate task is already running",
                    "timestamp": time.time(),
                }).to_json())
                logger.warning("Rejected operate task %s — operator busy", task_id)
                return
            # The operator loop sends MULTIMODAL_REQUEST on this same atrium
            # connection and awaits the response. Awaiting it here would block
            # the connection's read loop and deadlock, so run it concurrently
            # and reply when it finishes.
            active_operator_task = asyncio.create_task(_run_task_and_reply(ws, msg, task_id))
            active_operator_task.add_done_callback(_clear_active_operator_task)
        else:
            result = await execute_task(msg)
            result_msg = Message("TASK_RESULT", {
                "task_id": task_id,
                "success": result["success"],
                "output": result.get("output", ""),
                "error": result.get("error"),
                "timestamp": time.time(),
            })
            await ws.send(result_msg.to_json())
            logger.info("Sent RESULT for task %s (success=%s)", task_id, result["success"])

    elif msg_type == "HEARTBEAT":
        await ws.send(Message("HEARTBEAT", {"timestamp": time.time()}).to_json())

    elif msg_type == "WORLD_STATE_PUSH":
        logger.info("Received world state: state=%s", msg.get("active_state"))

    elif msg_type == "VOICE_CONTROL" and voice_channel:
        result = await voice_channel.handle_control(msg.get("payload", msg))
        result_msg = Message("TASK_RESULT", {
            "task_id": msg.get("task_id", "voice_ctrl"),
            "success": result.get("success", True),
            "output": json.dumps(result),
            "timestamp": time.time(),
        })
        await ws.send(result_msg.to_json())
        logger.info("Voice control: %s → %s", msg.get("command", msg.get("payload", {}).get("command")), result)

    elif msg_type == "VOICE_OUTPUT" and voice_channel:
        await voice_channel.handle_voice_output(msg.get("payload", msg))
        logger.info("Voice output: speaking agent response")

    elif msg_type in SENSOR_MESSAGE_TYPES:
        token_cost = estimate_token_cost(raw)
        if not sensor_ingress_bucket.try_remove(token_cost):
            if msg_type in BUFFERED_SENSOR_MESSAGE_TYPES:
                buffer_sensor_event(raw, msg_type)
            logger.warning(
                "Backpressure held %s (%d token estimate)",
                msg_type,
                token_cost,
            )
            return
        if ws != bridge_connection:
            sensor_connections.add(ws)
        if bridge_connection and bridge_connection != ws:
            try:
                await bridge_connection.send(raw)
                logger.info("Relayed %s to Atrium", msg_type)
            except websockets.ConnectionClosed:
                logger.warning("Atrium disconnected while relaying %s", msg_type)
                bridge_connection = None
                if msg_type in BUFFERED_SENSOR_MESSAGE_TYPES:
                    buffer_sensor_event(raw, msg_type)
        elif bridge_connection and bridge_connection == ws:
            logger.info("Received %s from Atrium (ignoring relay)", msg_type)
        else:
            if msg_type in BUFFERED_SENSOR_MESSAGE_TYPES:
                buffer_sensor_event(raw, msg_type)
            else:
                logger.warning("No Atrium connection to relay %s", msg_type)

    else:
        logger.warning("Unknown message type: %s", msg_type)


def _clear_active_operator_task(_task) -> None:
    global active_operator_task
    if active_operator_task is _task:
        active_operator_task = None


async def _run_task_and_reply(ws, msg: dict, task_id: str) -> None:
    """Execute a task concurrently and send its TASK_RESULT when done."""
    try:
        result = await execute_task(msg)
    except Exception as exc:  # noqa: BLE001
        result = {"success": False, "output": "", "error": str(exc)}
    try:
        await ws.send(Message("TASK_RESULT", {
            "task_id": task_id,
            "success": result["success"],
            "output": result.get("output", ""),
            "error": result.get("error"),
            "timestamp": time.time(),
        }).to_json())
        logger.info("Sent RESULT for task %s (success=%s)", task_id, result["success"])
    except websockets.ConnectionClosed:
        logger.warning("Connection closed before RESULT for task %s", task_id)


async def execute_task(msg: dict) -> dict:
    task_type = msg.get("task_type", msg.get("type", "unknown"))
    payload = msg.get("payload", {})

    if task_type == "cli":
        result = await cli_execute(payload)
        return {
            "success": result["success"],
            "output": result.get("stdout", result.get("output", "")),
            "error": result.get("error"),
        }
    elif task_type == "screenshot":
        return await vision_execute(payload)
    elif task_type == "operate":
        goal = payload.get("goal") or payload.get("command") or payload.get("task") or ""
        if not goal:
            return {"success": False, "output": "", "error": "operate task requires a 'goal'"}
        if bridge_connection is None:
            return {"success": False, "output": "", "error": "no atrium connection for vision LLM"}
        try:
            from hands.vision.operator import run_operator
        except ImportError:
            from vision.operator import run_operator  # type: ignore
        return await run_operator(goal, bridge_connection.send, operator_multimodal_pending)
    elif task_type == "voice" and voice_channel:
        result = await voice_channel.handle_control(payload)
        return {"success": result.get("success", True), "output": json.dumps(result)}
    else:
        return {
            "success": False,
            "output": "",
            "error": f"unsupported task_type: {task_type}",
        }


async def send_pause_toggle():
    global bridge_connection
    if bridge_connection:
        try:
            msg = Message("PAUSE_TOGGLE", {"timestamp": time.time()})
            await bridge_connection.send(msg.to_json())
            logger.info("Sent PAUSE_TOGGLE to Atrium")
        except Exception as e:
            logger.error("Failed to send PAUSE_TOGGLE: %s", e)
    else:
        logger.warning("Hotkey triggered but Atrium not connected")


def send_pause_toggle_from_thread():
    global main_loop
    if main_loop and main_loop.is_running():
        asyncio.run_coroutine_threadsafe(send_pause_toggle(), main_loop)
    else:
        logger.warning("Hotkey triggered but main loop is not running")


sensor_connections = set()


async def _send_auth_error(ws, reason: str) -> None:
    payload = Message(
        SYNAPSE_AUTH_ERROR,
        {"reason": reason, "timestamp": time.time()},
    )
    try:
        await ws.send(payload.to_json())
    except websockets.ConnectionClosed:
        pass


async def _await_auth(ws, peer) -> bool:
    """Block until a SYNAPSE_AUTH arrives. Returns True iff token is valid."""
    try:
        raw = await asyncio.wait_for(ws.recv(), timeout=AUTH_HANDSHAKE_TIMEOUT_S)
    except asyncio.TimeoutError:
        logger.warning("AUTH handshake timed out from %s", peer)
        await _send_auth_error(ws, "auth_timeout")
        return False
    except websockets.ConnectionClosed:
        return False

    try:
        msg = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("AUTH handshake malformed from %s", peer)
        await _send_auth_error(ws, "auth_malformed")
        return False

    if msg.get("type") != SYNAPSE_AUTH:
        logger.warning(
            "First message from non-loopback peer %s was %s, not SYNAPSE_AUTH",
            peer,
            msg.get("type"),
        )
        await _send_auth_error(ws, "auth_required")
        return False

    if not synapse_token:
        logger.error("Non-loopback peer %s connected but no synapse token loaded", peer)
        await _send_auth_error(ws, "server_unconfigured")
        return False

    if not secrets.compare_digest(msg.get("token", ""), synapse_token):
        logger.warning("AUTH handshake rejected from %s (bad token)", peer)
        await _send_auth_error(ws, "auth_invalid")
        return False

    ok = Message(SYNAPSE_AUTH_OK, {"timestamp": time.time()})
    await ws.send(ok.to_json())
    logger.info("AUTH handshake OK for %s", peer)
    return True


async def connection_handler(ws):
    global bridge_connection
    peer = ws.remote_address
    is_loopback = _is_loopback_peer(peer)
    logger.info(
        "Client connected from %s (loopback=%s)", peer, is_loopback
    )

    if not is_loopback:
        if not await _await_auth(ws, peer):
            await ws.close(code=4401, reason="auth_failed")
            return
        authenticated_connections.add(ws)

    try:
        async for raw in ws:
            # Loopback peers may still send SYNAPSE_AUTH for protocol uniformity;
            # accept and ack without revalidating.
            try:
                preview = json.loads(raw)
            except json.JSONDecodeError:
                preview = None
            if isinstance(preview, dict) and preview.get("type") == SYNAPSE_AUTH:
                if is_loopback:
                    ok = Message(SYNAPSE_AUTH_OK, {"timestamp": time.time()})
                    await ws.send(ok.to_json())
                continue
            await handle_message(ws, raw)
    except websockets.ConnectionClosed:
        pass
    finally:
        authenticated_connections.discard(ws)
        if ws == bridge_connection:
            logger.warning("Atrium disconnected")
            await fail_pending_multimodal_requests("atrium_disconnected")
            bridge_connection = None
        else:
            for request_id, requester in list(multimodal_requesters.items()):
                if requester == ws:
                    multimodal_requesters.pop(request_id, None)
            sensor_connections.discard(ws)
            logger.info("Sensor/client disconnected from %s", peer)


def watchdog_loop():
    while not shutdown_event.is_set():
        time.sleep(5)
        if bridge_connection is None:
            logger.warning("Bridge disconnected — waiting for Atrium reconnect")


def _load_env_files():
    """Zero-dependency .env loader. Reads repo .env + $PARIX_HOME/.env (default
    ~/.parix/.env) into os.environ. Existing env vars always win. Mirrors
    atrium's loadEnv() so the same .env works for hands too."""
    from pathlib import Path

    parix_home = os.getenv("PARIX_HOME") or str(Path.home() / ".parix")
    here = Path(__file__).resolve().parent.parent  # repo root (parent of hands/)
    candidates = [here / ".env", Path(parix_home) / ".env"]
    for env_path in candidates:
        try:
            if not env_path.is_file():
                continue
            for line in env_path.read_text(encoding="utf-8").splitlines():
                trimmed = line.strip()
                if not trimmed or trimmed.startswith("#") or "=" not in trimmed:
                    continue
                key, _, val = trimmed.partition("=")
                key = key.strip()
                val = val.strip().strip("'\"")
                if key and key not in os.environ:
                    os.environ[key] = val
        except OSError as exc:
            logger.warning("Failed to read env file %s: %s", env_path, exc)


async def main():
    _load_env_files()
    global main_loop
    loop = asyncio.get_event_loop()
    main_loop = loop

    # Start global hotkey listener for Ctrl+Shift+P
    start_hotkey_listener(send_pause_toggle_from_thread)

    def signal_handler():
        logger.info("Shutdown signal received")
        shutdown_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, signal_handler)
        except NotImplementedError:
            signal.signal(sig, lambda s, f: signal_handler())

    watchdog = threading.Thread(target=watchdog_loop, daemon=True)
    watchdog.start()

    global synapse_token
    _enforce_bind_policy()
    synapse_token = load_or_create_token()

    # Start the shadow loop (proactive health monitor)
    start_shadow_thread(interval=60.0, url=f"ws://{HOST}:{PORT}")
    logger.info("Shadow loop started (60s interval)")

    logger.info("Hands WebSocket server starting on ws://%s:%d", HOST, PORT)
    async with websockets.serve(connection_handler, HOST, PORT):
        # Start the OS watcher (Phase 3 — Eyes & Ears)
        watcher_task = asyncio.create_task(
            watcher_loop(url=f"ws://{HOST}:{PORT}", poll_interval=2.0)
        )
        logger.info("OS watcher started (2s poll interval)")

        a11y_interval = float(os.getenv("PARIX_A11Y_INTERVAL_S", "1.0"))
        a11y_mode = os.getenv("PARIX_A11Y_MODE", "auto")
        if os.getenv("PARIX_A11Y_DISABLED", "").lower() not in ("1", "true", "yes"):
            a11y_task = asyncio.create_task(
                a11y_poller_loop(
                    url=f"ws://{HOST}:{PORT}",
                    interval_s=a11y_interval,
                    mode=a11y_mode,
                )
            )
            logger.info(
                "Accessibility poller started (mode=%s, interval=%.2fs)",
                a11y_mode,
                a11y_interval,
            )
        else:
            a11y_task = None
            logger.info("Accessibility poller disabled by PARIX_A11Y_DISABLED")

        if (
            neurosymbolic_sidecar_loop is not None
            and os.getenv("PARIX_NEUROSYMBOLIC_DISABLED", "").lower()
            not in ("1", "true", "yes")
        ):
            neuro_task = asyncio.create_task(neurosymbolic_sidecar_loop())
            logger.info("Neuro-symbolic sidecar started")
        else:
            neuro_task = None
            logger.info("Neuro-symbolic sidecar disabled")

        await shutdown_event.wait()
        watcher_task.cancel()
        if a11y_task is not None:
            a11y_task.cancel()
        if neuro_task is not None:
            neuro_task.cancel()
    logger.info("Hands shut down cleanly")


if __name__ == "__main__":
    asyncio.run(main())
