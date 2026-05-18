import asyncio
import json
import logging
import os
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
    from hands.sensors.shadow_loop import start_shadow_thread
except ImportError:
    from sensors.shadow_loop import start_shadow_thread
try:
    from hands.sensors.watcher import watch_loop as watcher_loop
except ImportError:
    from sensors.watcher import watch_loop as watcher_loop
try:
    from hands.sensors.a11y_poller import run_loop as a11y_poller_loop
except ImportError:
    from sensors.a11y_poller import run_loop as a11y_poller_loop
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
bridge_connection = None
shutdown_event = asyncio.Event()
voice_channel = VoiceChannel() if VoiceChannel else None

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

VISION_OCR_REQUEST = "VISION_OCR_REQUEST"
VISION_OCR_RESPONSE = "VISION_OCR_RESPONSE"


@dataclass
class Message:
    type: str
    data: dict

    def to_json(self) -> str:
        return json.dumps({"type": self.type, **self.data})


sensor_relay_buffer = deque(maxlen=SENSOR_RELAY_BUFFER_SIZE)
vision_ocr_requesters = {}


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


async def send_vision_ocr_error(ws, request_id: str, error: str) -> None:
    response = Message(
        VISION_OCR_RESPONSE,
        {
            "request_id": request_id,
            "text": "",
            "error": error,
            "timestamp": time.time(),
        },
    )
    await ws.send(response.to_json())


async def handle_vision_ocr_request(ws, raw: str, msg: dict) -> None:
    request_id = msg.get("request_id")
    if not request_id:
        logger.warning("VISION_OCR_REQUEST missing request_id")
        return

    if bridge_connection is None or bridge_connection == ws:
        await send_vision_ocr_error(ws, request_id, "no_atrium_connection")
        return

    vision_ocr_requesters[request_id] = ws
    try:
        await bridge_connection.send(raw)
        logger.info("Relayed VISION_OCR_REQUEST %s to Atrium", request_id)
    except websockets.ConnectionClosed:
        logger.warning("Atrium disconnected while relaying VISION_OCR_REQUEST")
        vision_ocr_requesters.pop(request_id, None)
        await send_vision_ocr_error(ws, request_id, "atrium_disconnected")


async def handle_vision_ocr_response(raw: str, msg: dict) -> None:
    request_id = msg.get("request_id")
    if not request_id:
        logger.warning("VISION_OCR_RESPONSE missing request_id")
        return

    requester = vision_ocr_requesters.pop(request_id, None)
    if requester is None:
        logger.warning("No requester waiting for VISION_OCR_RESPONSE %s", request_id)
        return

    try:
        await requester.send(raw)
        logger.info("Relayed VISION_OCR_RESPONSE %s to requester", request_id)
    except websockets.ConnectionClosed:
        logger.warning("Requester disconnected before VISION_OCR_RESPONSE %s", request_id)


async def fail_pending_vision_ocr_requests(error: str) -> None:
    pending = list(vision_ocr_requesters.items())
    vision_ocr_requesters.clear()
    for request_id, requester in pending:
        try:
            await send_vision_ocr_error(requester, request_id, error)
        except websockets.ConnectionClosed:
            logger.warning("Requester disconnected before VISION_OCR error %s", request_id)


async def handle_message(ws, raw: str):
    global bridge_connection

    try:
        msg = json.loads(raw)
    except json.JSONDecodeError:
        logger.error("Malformed message: %s", raw[:200])
        return

    msg_type = msg.get("type")
    logger.info("Received: %s", msg_type)

    if msg_type == VISION_OCR_REQUEST:
        await handle_vision_ocr_request(ws, raw, msg)
        return

    if msg_type == VISION_OCR_RESPONSE:
        if ws != bridge_connection:
            logger.warning("Ignoring VISION_OCR_RESPONSE from non-Atrium client")
            return
        await handle_vision_ocr_response(raw, msg)
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
    elif task_type == "voice" and voice_channel:
        result = await voice_channel.handle_control(payload)
        return {"success": result.get("success", True), "output": json.dumps(result)}
    else:
        return {"success": True, "output": f"executed {task_type}"}


sensor_connections = set()


async def connection_handler(ws):
    global bridge_connection
    peer = ws.remote_address
    logger.info("Client connected from %s", peer)

    try:
        async for raw in ws:
            await handle_message(ws, raw)
    except websockets.ConnectionClosed:
        pass
    finally:
        if ws == bridge_connection:
            logger.warning("Atrium disconnected")
            await fail_pending_vision_ocr_requests("atrium_disconnected")
            bridge_connection = None
        else:
            for request_id, requester in list(vision_ocr_requesters.items()):
                if requester == ws:
                    vision_ocr_requesters.pop(request_id, None)
            sensor_connections.discard(ws)
            logger.info("Sensor/client disconnected from %s", peer)


def watchdog_loop():
    while not shutdown_event.is_set():
        time.sleep(5)
        if bridge_connection is None:
            logger.warning("Bridge disconnected — waiting for Atrium reconnect")


async def main():
    loop = asyncio.get_event_loop()

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

        await shutdown_event.wait()
        watcher_task.cancel()
        if a11y_task is not None:
            a11y_task.cancel()
    logger.info("Hands shut down cleanly")


if __name__ == "__main__":
    asyncio.run(main())
