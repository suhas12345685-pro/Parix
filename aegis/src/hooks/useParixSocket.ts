import { useCallback, useEffect, useRef, useState } from "react";
import type {
  WsMessage,
  SystemHealth,
  AtriumState,
  SensorEvent,
  AuditEntry,
} from "../types";

const AEGIS_WS_URL = `ws://${window.location.hostname}:8766`;
const RECONNECT_BASE_DELAY = 3000;
const RECONNECT_MAX_DELAY = 30000;
const EVENT_BUFFER_LIMIT = 100;

interface ChatResponse {
  id: string;
  text: string;
}

const emptyHealth: SystemHealth = {
  dashboard: {
    atriumState: "IDLE",
    paused: false,
    pausedAt: null,
    handsStatus: "disconnected",
    queueDepth: 0,
    uptime: 0,
    lastUpdate: 0,
  },
  skills: { totalPatterns: 0, hitRate: 0 },
  dlq: { pending: 0, exhausted: 0 },
  governor: {
    minuteCount: 0,
    hourCount: 0,
    dailyTokens: 0,
    dailyLimit: 100000,
  },
  cognition: {
    attention: { focus: null, strength: 0, admitRate: 1, suppressedCount: 0 },
    metacognition: { cognitiveLoad: 0 },
    activePlan: null,
    activeNarratives: [],
  },
  channels: [
    {
      id: "aegis",
      enabled: true,
      config: { kind: "voice", autoStart: "true", wakeWord: "aegis" },
    },
  ],
  cronTasks: [],
  installedSkills: [],
  workspaceFiles: [],
  recentEvents: [],
  recentAudit: [],
};

export function useParixSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null);
  const [health, setHealth] = useState<SystemHealth>(emptyHealth);
  const [events, setEvents] = useState<SensorEvent[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [chatResponses, setChatResponses] = useState<ChatResponse[]>([]);

  const handleMessage = useCallback((msg: WsMessage) => {
    setLastMessageAt(Date.now());

    switch (msg.type) {
      case "HEALTH_SNAPSHOT": {
        const snapshot = msg.data as SystemHealth;
        setHealth((prev) => mergeHealthSnapshot(prev, snapshot));
        setEvents(snapshot.recentEvents ?? []);
        setAudit(snapshot.recentAudit ?? []);
        break;
      }

      case "STATE_CHANGE":
        setHealth((prev) => ({
          ...prev,
          dashboard: {
            ...prev.dashboard,
            atriumState: msg.to as AtriumState,
            lastUpdate: Date.now(),
          },
        }));
        break;

      case "SENSOR_EVENT": {
        const event = sensorEventFromMessage(msg);
        setEvents((prev) => prepend(event, prev));
        setHealth((prev) => ({
          ...prev,
          recentEvents: prepend(event, prev.recentEvents),
          dashboard: { ...prev.dashboard, lastUpdate: Date.now() },
        }));
        break;
      }

      case "AUDIT_ENTRY": {
        const entry = msg.entry as AuditEntry;
        setAudit((prev) => prepend(entry, prev));
        setHealth((prev) => ({
          ...prev,
          recentAudit: prepend(entry, prev.recentAudit),
          dashboard: { ...prev.dashboard, lastUpdate: Date.now() },
        }));
        break;
      }

      case "PAUSE_STATUS":
        setHealth((prev) => ({
          ...prev,
          dashboard: {
            ...prev.dashboard,
            paused: Boolean(msg.paused),
            pausedAt:
              typeof msg.pausedAt === "number" ? msg.pausedAt : null,
            lastUpdate: Date.now(),
          },
        }));
        break;

      case "QUEUE_UPDATE":
        setHealth((prev) => ({
          ...prev,
          dashboard: {
            ...prev.dashboard,
            queueDepth: Number(msg.depth ?? prev.dashboard.queueDepth),
            lastUpdate: Date.now(),
          },
        }));
        break;

      case "CHAT_RESULT":
        setChatResponses((prev) => [
          ...prev,
          {
            id: String(msg.id ?? `${Date.now()}`),
            text: String(msg.text ?? ""),
          },
        ].slice(-EVENT_BUFFER_LIMIT));
        break;

      case "CHANNELS_SAVED":
        if (Array.isArray(msg.channels)) {
          setHealth((prev) => ({
            ...prev,
            channels: msg.channels as SystemHealth["channels"],
          }));
        }
        break;

      case "CRON_TASKS_SAVED":
        if (Array.isArray(msg.cronTasks)) {
          setHealth((prev) => ({
            ...prev,
            cronTasks: msg.cronTasks as SystemHealth["cronTasks"],
          }));
        }
        break;

      case "SKILL_CREATED":
        if (Array.isArray(msg.installedSkills)) {
          setHealth((prev) => ({
            ...prev,
            installedSkills: msg.installedSkills as SystemHealth["installedSkills"],
          }));
        }
        break;

      case "ERROR":
      case "ENGINE_ERROR":
        setLastError(String(msg.message ?? "Aegis relay reported an error."));
        break;
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(AEGIS_WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setReconnecting(false);
      setReconnectAttempt(0);
      setLastError(null);
      ws.send(JSON.stringify({ type: "AEGIS_SUBSCRIBE" }));
    };

    ws.onmessage = (e) => {
      try {
        const msg: WsMessage = JSON.parse(e.data);
        handleMessage(msg);
      } catch {
        // The relay can keep streaming even if one message is malformed.
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setReconnecting(true);
      setReconnectAttempt((prev) => {
        const next = prev + 1;
        const delay = Math.min(
          RECONNECT_BASE_DELAY * Math.pow(1.5, Math.min(next, 10)),
          RECONNECT_MAX_DELAY,
        );
        reconnectTimerRef.current = window.setTimeout(connect, delay);
        return next;
      });
    };

    ws.onerror = () => {
      setLastError("Aegis relay WebSocket is unavailable.");
      ws.close();
    };
  }, [handleMessage]);

  const sendCommand = useCallback(
    (command: string, payload?: Record<string, unknown>) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: "AEGIS_COMMAND", command, ...payload }),
        );
      } else {
        setLastError("Command was not sent because Aegis is reconnecting.");
      }
    },
    [],
  );

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current)
        window.clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return {
    connected,
    reconnecting,
    reconnectAttempt,
    lastError,
    lastMessageAt,
    health,
    events,
    audit,
    chatResponses,
    sendCommand,
  };
}

function mergeHealthSnapshot(
  prev: SystemHealth,
  snapshot: SystemHealth,
): SystemHealth {
  return {
    ...prev,
    ...snapshot,
    dashboard: {
      ...prev.dashboard,
      ...snapshot.dashboard,
      lastUpdate: snapshot.dashboard?.lastUpdate ?? Date.now(),
    },
    cognition: {
      ...prev.cognition,
      ...snapshot.cognition,
      attention: {
        ...prev.cognition.attention,
        ...snapshot.cognition?.attention,
      },
      metacognition: {
        ...prev.cognition.metacognition,
        ...snapshot.cognition?.metacognition,
      },
    },
    recentEvents: snapshot.recentEvents ?? prev.recentEvents,
    recentAudit: snapshot.recentAudit ?? prev.recentAudit,
  };
}

function sensorEventFromMessage(msg: WsMessage): SensorEvent {
  return {
    id: String(msg.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    eventType: String(msg.event_type ?? "unknown"),
    data:
      msg.data && typeof msg.data === "object"
        ? (msg.data as Record<string, unknown>)
        : {},
    confidence: Number(msg.confidence ?? 0),
    timestamp: Number(msg.timestamp ?? Date.now()),
  };
}

function prepend<T>(item: T, list: T[]): T[] {
  return [item, ...list].slice(0, EVENT_BUFFER_LIMIT);
}
