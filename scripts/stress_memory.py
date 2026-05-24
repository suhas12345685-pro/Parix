import asyncio
import json
import psutil
import os
import sys
import time

# Ensure hands module can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from hands import main as hands_main

class FakeWebSocket:
    def __init__(self):
        self.sent = []
        self.remote_address = ("stress_test", 0)

    async def send(self, raw: str):
        # We don't store sent messages to avoid false positive memory leaks in the test itself
        pass

def reset_bridge_state():
    hands_main.bridge_connection = None
    hands_main.sensor_connections.clear()
    hands_main.sensor_relay_buffer.clear()
    hands_main.multimodal_requesters.clear()

async def run_memory_stress(duration_minutes: int):
    print(f"Starting memory stress test for {duration_minutes} minutes...")
    process = psutil.Process(os.getpid())
    
    sensor = FakeWebSocket()
    atrium = FakeWebSocket()
    
    reset_bridge_state()
    hands_main.bridge_connection = atrium
    
    start_time = time.time()
    end_time = start_time + (duration_minutes * 60)
    
    events_processed = 0
    
    while time.time() < end_time:
        # Simulate burst of events
        for i in range(100):
            await hands_main.handle_message(
                sensor,
                json.dumps({
                    "type": "SENSOR_EVENT",
                    "event_type": "stress_memory",
                    "data": {"index": events_processed, "payload": "X" * 512}, 
                    "confidence": 0.8
                })
            )
            events_processed += 1
            
        rss_mb = process.memory_info().rss / (1024 * 1024)
        
        # Log progress every ~1000 events
        if events_processed % 1000 == 0:
            print(f"Processed {events_processed} events... Current RSS: {rss_mb:.2f}MB")
        
        if rss_mb > 100:
            print(f"\nFAILED: Memory footprint exceeded 100MB (Current: {rss_mb:.2f}MB)")
            sys.exit(1)
            
        await asyncio.sleep(0.01) # Yield to event loop
        
    print(f"\nSUCCESS: Completed {duration_minutes} minutes of stress testing.")
    print(f"Total events processed: {events_processed}")
    print(f"Final RSS: {process.memory_info().rss / (1024 * 1024):.2f}MB")

if __name__ == "__main__":
    duration = 60 # 1 hour by default
    if len(sys.argv) > 1:
        duration = int(sys.argv[1])
        
    asyncio.run(run_memory_stress(duration))
