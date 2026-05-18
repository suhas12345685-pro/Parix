# Parix Stress Test — Council State Machine
# Tests Council behavior under rapid-fire state transitions
# Uses k6 for orchestration

import ws from "k6/ws";
import { check, sleep } from "k6";
import { Counter, Rate } from "k6/metrics";

const stateTransitions = new Counter("state_transitions");
const failedTransitions = new Rate("failed_transitions");

export const options = {
  scenarios: {
    rapid_fire_events: {
      executor: "constant-vus",
      vus: 20,
      duration: "3m",
    },
  },
  thresholds: {
    failed_transitions: ["rate<0.01"], // Less than 1% failure rate
    state_transitions: ["count>500"],
  },
};

const EVENT_TYPES = [
  "terminal_error",
  "terminal_activity",
  "window_switch",
  "idle_timeout",
  "file_change",
  "process_crash",
];

export default function () {
  const url = __ENV.HANDS_WS_URL || "ws://localhost:8765";

  const res = ws.connect(url, {}, function (socket) {
    socket.on("open", () => {
      // Rapid-fire events every 200ms to stress the Council
      socket.setInterval(function () {
        const eventType =
          EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];

        socket.send(
          JSON.stringify({
            type: "SENSOR_EVENT",
            event_type: eventType,
            data: {
              source: `stress-vu-${__VU}`,
              payload: `Stress test event ${Date.now()}`,
            },
            confidence: Math.random(),
            timestamp: new Date().toISOString(),
          })
        );
        stateTransitions.add(1);
      }, 200);
    });

    socket.on("message", (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === "ERROR" || msg.type === "COUNCIL_ERROR") {
          failedTransitions.add(1);
        } else {
          failedTransitions.add(0);
        }
      } catch (e) {
        failedTransitions.add(1);
      }
    });

    socket.setTimeout(function () {
      socket.close();
    }, 180000);
  });

  check(res, {
    "WS connected": (r) => r && r.status === 101,
  });
}
