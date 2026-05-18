import type {
  CognitiveEvent,
  FocusedElement,
  WorkingMemory,
} from "./types.js";
import { getLatestAccessibility } from "../synapse/a11y-handler.js";

const MAX_SIGNALS = 30;

let memory: WorkingMemory = {
  currentGoal: null,
  activeApp: null,
  activeProject: null,
  recentSignals: [],
  blockers: [],
  assumptions: [],
  uncertainty: 0.5,
  focusedElement: null,
  updatedAt: Date.now(),
};

export function updateWorkingMemory(event: CognitiveEvent): WorkingMemory {
  const recentSignals = [event, ...memory.recentSignals].slice(0, MAX_SIGNALS);
  const blockers = inferBlockers(recentSignals);
  const focusedElement = readFocusedElement();
  const currentGoal = inferGoal(recentSignals, focusedElement);
  const activeApp =
    String(
      event.data.app ??
        event.data.active_app ??
        memory.activeApp ??
        readFocusedAppFallback() ??
        "",
    ) || null;
  const activeProject =
    String(
      event.data.project ??
        event.data.repo ??
        event.data.cwd ??
        memory.activeProject ??
        "",
    ) || null;

  memory = {
    currentGoal,
    activeApp,
    activeProject,
    recentSignals,
    blockers,
    assumptions: inferAssumptions(recentSignals, focusedElement),
    uncertainty: estimateUncertainty(recentSignals, blockers),
    focusedElement,
    updatedAt: Date.now(),
  };

  return memory;
}

function readFocusedElement(): FocusedElement | null {
  const latest = getLatestAccessibility();
  if (!latest || !latest.focusedElement) return null;
  const el = latest.focusedElement;
  return {
    role: el.role,
    name: el.name,
    value: el.value ?? null,
    state: Array.isArray(el.state) ? el.state : [],
    bounds: el.bounds ?? null,
  };
}

function readFocusedAppFallback(): string | null {
  const latest = getLatestAccessibility();
  return latest?.focusedApp || null;
}

export function getWorkingMemory(): WorkingMemory {
  return memory;
}

function inferGoal(
  events: CognitiveEvent[],
  focused: FocusedElement | null,
): string | null {
  const types = events.map((event) => event.type);
  if (types.includes("terminal_error"))
    return "debugging a command or development workflow";
  if (types.includes("clipboard_sensitive_data"))
    return "configuring credentials or secrets";
  if (types.includes("wifi_disconnected"))
    return "restoring network connectivity";
  if (types.includes("app_crash") || types.includes("app_hang"))
    return "recovering an interrupted app workflow";
  if (types.includes("disk_low"))
    return "freeing enough space to keep work moving";
  if (types.includes("memory_high") || types.includes("cpu_high"))
    return "stabilizing machine performance";

  // Fall back to focused-element shape when no recent event tells us.
  if (focused) {
    const role = focused.role.toLowerCase();
    if (role.includes("text") || role === "edit")
      return "composing or editing text";
    if (role.includes("button") && focused.name)
      return `considering action: ${focused.name}`;
    if (role.includes("menu")) return "navigating an application menu";
    if (role.includes("dialog") || role.includes("alert"))
      return "responding to a dialog";
  }
  return null;
}

function inferBlockers(events: CognitiveEvent[]): string[] {
  const blockers = new Set<string>();
  for (const event of events) {
    if (event.type.includes("error")) blockers.add("recent error");
    if (event.type.includes("battery")) blockers.add("low battery");
    if (event.type.includes("disk")) blockers.add("low disk space");
    if (event.type.includes("memory")) blockers.add("memory pressure");
    if (event.type.includes("wifi")) blockers.add("network instability");
  }
  return [...blockers].slice(0, 6);
}

function inferAssumptions(
  events: CognitiveEvent[],
  focused: FocusedElement | null,
): string[] {
  const assumptions: string[] = [];
  if (events.some((event) => event.type === "terminal_error")) {
    assumptions.push(
      "user likely wants the failing command explained or fixed",
    );
  }
  if (events.some((event) => event.type === "clipboard_sensitive_data")) {
    assumptions.push("user may be wiring provider credentials");
  }
  if (events.length > 3) {
    assumptions.push(
      "recent repeated signals may indicate a broader workflow, not an isolated alert",
    );
  }
  if (focused) {
    const role = focused.role.toLowerCase();
    if (role.includes("text") || role === "edit") {
      assumptions.push("user is actively typing — avoid interrupting");
    } else if (role.includes("dialog") || role.includes("alert")) {
      assumptions.push(
        "a modal dialog is in focus — the user is mid-decision",
      );
    }
  }
  return assumptions;
}

function estimateUncertainty(
  events: CognitiveEvent[],
  blockers: string[],
): number {
  if (events.length === 0) return 0.8;
  const confidence =
    events.slice(0, 5).reduce((sum, event) => sum + event.confidence, 0) /
    Math.min(events.length, 5);
  const blockerPenalty = Math.min(0.2, blockers.length * 0.04);
  return Math.max(0.05, Math.min(0.95, 1 - confidence + blockerPenalty));
}
