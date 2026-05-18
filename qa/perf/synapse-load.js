# Parix Performance Test Configuration
# Uses k6 (https://k6.io/) for load testing the Synapse bridge

import ws from "k6/ws";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

// ─── Custom Metrics ───────────────────────────────────────────
const messagesSent = new Counter("messages_sent");
const messagesReceived = new Counter("messages_received");
const ackLatency = new Trend("ack_latency_ms");
const roundtripLatency = new Trend("roundtrip_latency_ms");

// ─── Test Configuration ──────────────────────────────────────
export const options = {
  scenarios: {
    // Sustained load: 50 concurrent WebSocket connections
    sustained_load: {
      executor: "constant-vus",
      vus: 50,
      duration: "2m",
    },
    // Spike test: ramp to 200 connections
    spike: {
      executor: "ramping-vus",
      startVUs: 10,
      stages: [
        { duration: "30s", target: 50 },
        { duration: "30s", target: 200 },
        { duration: "1m", target: 200 },
        { duration: "30s", target: 0 },
      ],
      startTime: "3m",
    },
  },
  thresholds: {
    ack_latency_ms: ["p(95)<200", "p(99)<500"],
    roundtrip_latency_ms: ["p(95)<2000"],
    messages_sent: ["count>1000"],
  },
};

// ─── WebSocket Load Test ─────────────────────────────────────
export default function () {
  const url = __ENV.HANDS_WS_URL || "ws://localhost:8765";

  const res = ws.connect(url, {}, function (socket) {
    socket.on("open", () => {
      // Send SENSOR_EVENTs at 2-second intervals
      socket.setInterval(function () {
        const taskId = `perf-${__VU}-${Date.now()}`;
        const sentAt = Date.now();

        socket.send(
          JSON.stringify({
            type: "SENSOR_EVENT",
            event_type: "terminal_activity",
            data: {
              window_title: `Performance Test VU ${__VU}`,
              activity: "idle",
            },
            confidence: 0.5,
            timestamp: new Date().toISOString(),
            _perf_task_id: taskId,
            _perf_sent_at: sentAt,
          })
        );
        messagesSent.add(1);
      }, 2000);
    });

    socket.on("message", (data) => {
      messagesReceived.add(1);
      try {
        const msg = JSON.parse(data);
        if (msg.type === "TASK_ACK" && msg._perf_sent_at) {
          ackLatency.add(Date.now() - msg._perf_sent_at);
        }
        if (msg.type === "TASK_RESULT" && msg._perf_sent_at) {
          roundtripLatency.add(Date.now() - msg._perf_sent_at);
        }
      } catch (e) {
        // Non-JSON message, ignore
      }
    });

    socket.on("error", (e) => {
      console.error(`WS error: ${e.error()}`);
    });

    // Keep connection alive for the scenario duration
    socket.setTimeout(function () {
      socket.close();
    }, 120000);
  });

  check(res, {
    "WebSocket connection established": (r) => r && r.status === 101,
  });
}
