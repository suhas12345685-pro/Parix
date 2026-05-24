from __future__ import annotations

import asyncio
import json
from collections import deque

from hands import main as hands_main


class FakeWebSocket:
    def __init__(self):
        self.sent: list[dict] = []
        self.remote_address = ("test", 0)

    async def send(self, raw: str):
        self.sent.append(json.loads(raw))


def reset_bridge_state():
    hands_main.bridge_connection = None
    hands_main.sensor_connections.clear()
    hands_main.sensor_relay_buffer.clear()
    hands_main.multimodal_requesters.clear()


def test_task_request_gets_ack_and_result(monkeypatch):
    ws = FakeWebSocket()

    async def fake_execute_task(msg):
        assert msg["task_id"] == "task-1"
        return {"success": True, "output": "done", "error": None}

    monkeypatch.setattr(hands_main, "execute_task", fake_execute_task)
    reset_bridge_state()

    asyncio.run(
        hands_main.handle_message(
            ws,
            json.dumps(
                {
                    "type": "TASK_REQUEST",
                    "task_id": "task-1",
                    "task_type": "cli",
                    "payload": {"argv": ["echo", "hello"]},
                }
            ),
        )
    )

    assert [msg["type"] for msg in ws.sent] == ["REBOOT_SYNC", "TASK_ACK", "TASK_RESULT"]
    assert ws.sent[1]["status"] == "received"
    assert ws.sent[2]["success"] is True
    assert ws.sent[2]["output"] == "done"


def test_sensor_event_relays_to_registered_atrium():
    atrium = FakeWebSocket()
    sensor = FakeWebSocket()
    reset_bridge_state()
    hands_main.bridge_connection = atrium

    asyncio.run(
        hands_main.handle_message(
            sensor,
            json.dumps(
                {
                    "type": "SENSOR_EVENT",
                    "event_type": "terminal_error",
                    "data": {"line": "npm ERR!"},
                    "confidence": 0.92,
                }
            ),
        )
    )

    assert atrium.sent[-1]["type"] == "SENSOR_EVENT"
    assert atrium.sent[-1]["event_type"] == "terminal_error"


def test_heartbeat_echoes_without_registering_bridge():
    ws = FakeWebSocket()
    reset_bridge_state()

    asyncio.run(hands_main.handle_message(ws, json.dumps({"type": "HEARTBEAT"})))

    assert ws.sent[0]["type"] == "REBOOT_SYNC"
    assert ws.sent[1]["type"] == "HEARTBEAT"


def test_sensor_events_buffer_while_atrium_offline_and_replay_after_reboot_sync(monkeypatch):
    sensor = FakeWebSocket()
    atrium = FakeWebSocket()
    reset_bridge_state()

    async def fake_execute_task(msg):
        return {"success": True, "output": "done", "error": None}

    monkeypatch.setattr(hands_main, "execute_task", fake_execute_task)

    asyncio.run(
        hands_main.handle_message(
            sensor,
            json.dumps(
                {
                    "type": "SENSOR_EVENT",
                    "event_type": "terminal_error",
                    "data": {"line": "npm ERR! missing module"},
                    "confidence": 0.91,
                }
            ),
        )
    )
    asyncio.run(
        hands_main.handle_message(
            sensor,
            json.dumps(
                {
                    "type": "SILENT_INTENT_EVENT",
                    "intent_type": "idle_after_error",
                    "data": {"seconds": 600},
                    "confidence": 0.8,
                }
            ),
        )
    )

    assert len(hands_main.sensor_relay_buffer) == 2

    asyncio.run(
        hands_main.handle_message(
            atrium,
            json.dumps(
                {
                    "type": "TASK_REQUEST",
                    "task_id": "task-reconnect",
                    "task_type": "noop",
                    "payload": {},
                }
            ),
        )
    )

    assert [msg["type"] for msg in atrium.sent] == [
        "REBOOT_SYNC",
        "SENSOR_EVENT",
        "SILENT_INTENT_EVENT",
        "TASK_ACK",
        "TASK_RESULT",
    ]
    assert atrium.sent[1]["event_type"] == "terminal_error"
    assert atrium.sent[2]["intent_type"] == "idle_after_error"
    assert len(hands_main.sensor_relay_buffer) == 0


def test_sensor_relay_buffer_is_bounded():
    sensor = FakeWebSocket()
    original_buffer = hands_main.sensor_relay_buffer
    reset_bridge_state()
    hands_main.sensor_relay_buffer = deque(maxlen=2)

    try:
        for index in range(3):
            asyncio.run(
                hands_main.handle_message(
                    sensor,
                    json.dumps(
                        {
                            "type": "SENSOR_EVENT",
                            "event_type": f"event-{index}",
                            "data": {},
                            "confidence": 0.7,
                        }
                    ),
                )
            )

        buffered = [json.loads(raw) for raw in hands_main.sensor_relay_buffer]
        assert [msg["event_type"] for msg in buffered] == ["event-1", "event-2"]
    finally:
        hands_main.sensor_relay_buffer = original_buffer
        reset_bridge_state()
