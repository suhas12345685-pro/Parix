import asyncio
import json
import psutil
import os
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

def test_sensor_flooding_stress():
    """Simulates 1000 sensor events hitting the bridge rapidly to ensure stability"""
    sensor = FakeWebSocket()
    atrium = FakeWebSocket()
    
    reset_bridge_state()
    hands_main.bridge_connection = atrium
    
    async def run_flood():
        tasks = []
        for i in range(1000):
            tasks.append(
                hands_main.handle_message(
                    sensor,
                    json.dumps({
                        "type": "SENSOR_EVENT",
                        "event_type": "stress_event",
                        "data": {"index": i},
                        "confidence": 0.99
                    })
                )
            )
        await asyncio.gather(*tasks)
    
    asyncio.run(run_flood())
    
    # All events should have been relayed to the atrium
    assert len(atrium.sent) == 1000
    assert atrium.sent[0]["type"] == "SENSOR_EVENT"

def test_memory_footprint_baseline():
    """Ensures memory footprint remains stable after rapid event processing (RSS < 100MB)"""
    process = psutil.Process(os.getpid())
    
    sensor = FakeWebSocket()
    atrium = FakeWebSocket()
    
    reset_bridge_state()
    hands_main.bridge_connection = atrium
    
    async def run_burst():
        for i in range(500):
            await hands_main.handle_message(
                sensor,
                json.dumps({
                    "type": "SENSOR_EVENT",
                    "event_type": "stress_memory",
                    "data": {"index": i, "payload": "X" * 1024}, # 1KB payload
                    "confidence": 0.8
                })
            )
            
    asyncio.run(run_burst())
    
    rss_mb = process.memory_info().rss / (1024 * 1024)
    # The process shouldn't bloat beyond 100MB for standard message passing
    assert rss_mb < 100, f"Memory footprint exceeded 100MB (Current: {rss_mb:.2f}MB)"
