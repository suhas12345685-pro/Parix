import type {
  CognitiveEvent,
  DesireInference,
  UserPreference,
  WorkingMemory,
  WorldFact,
} from "./types.js";

export function inferDesire(
  event: CognitiveEvent,
  memory: WorkingMemory,
  preferences: UserPreference[],
  worldFacts: WorldFact[],
): DesireInference {
  const evidence = buildEvidence(event, memory, preferences, worldFacts);
  const preferredQuiet = preferences.some(
    (pref) => pref.key === "low_interruption" && pref.confidence > 0.6,
  );
  const goal = memory.currentGoal ?? inferGoalFromEvent(event);
  const confidence = clamp(
    event.confidence * 0.55 +
      (1 - memory.uncertainty) * 0.25 +
      evidence.length * 0.04,
  );
  const suggestedHelp = suggestHelp(event, goal);
  const silentPrep = suggestSilentPrep(event, goal);
  const urgency = urgencyScore(event);

  // Soften interruption when the user is actively typing or mid-dialog —
  // accessibility tells us the focused element is a text field or dialog.
  const focusedRole = memory.focusedElement?.role.toLowerCase() ?? "";
  const userIsTyping =
    focusedRole.includes("text") || focusedRole === "edit";
  const inDialog =
    focusedRole.includes("dialog") || focusedRole.includes("alert");
  const interruptFloor = userIsTyping ? 0.85 : inDialog ? 0.9 : 0.72;
  const urgencyFloor = userIsTyping ? 0.6 : 0.45;
  const interrupt =
    !preferredQuiet && confidence >= interruptFloor && urgency >= urgencyFloor;

  return {
    inferredGoal: goal,
    userNeed: inferNeed(event, goal),
    evidence,
    confidence,
    suggestedHelp,
    silentPrep,
    interrupt,
    reasonToInterrupt: interrupt
      ? `confidence=${confidence.toFixed(2)}, urgency=${urgency.toFixed(2)}`
      : undefined,
  };
}

function buildEvidence(
  event: CognitiveEvent,
  memory: WorkingMemory,
  preferences: UserPreference[],
  worldFacts: WorldFact[],
): string[] {
  const evidence = [
    `sensor:${event.type}`,
    `confidence:${event.confidence.toFixed(2)}`,
  ];
  if (memory.currentGoal) evidence.push(`working_goal:${memory.currentGoal}`);
  if (memory.activeProject)
    evidence.push(`active_project:${memory.activeProject}`);
  if (memory.blockers.length > 0)
    evidence.push(`blockers:${memory.blockers.join(",")}`);
  if (memory.focusedElement) {
    const fe = memory.focusedElement;
    evidence.push(
      `focused:${fe.role}${fe.name ? `=${fe.name.slice(0, 60)}` : ""}`,
    );
    if (fe.state.length > 0) {
      evidence.push(`focused_state:${fe.state.slice(0, 3).join(",")}`);
    }
  }
  for (const pref of preferences.slice(0, 3))
    evidence.push(`preference:${pref.key}=${pref.value}`);
  for (const fact of worldFacts.slice(0, 3))
    evidence.push(`world:${fact.key}=${fact.value.slice(0, 80)}`);
  return evidence;
}

function inferGoalFromEvent(event: CognitiveEvent): string {
  if (event.type === "terminal_error")
    return "debugging a failed development command";
  if (event.type === "clipboard_sensitive_data")
    return "configuring credentials safely";
  if (event.type === "disk_low") return "restoring machine capacity";
  if (event.type === "memory_high" || event.type === "cpu_high")
    return "keeping the workstation responsive";
  if (event.type === "battery_low" || event.type === "silent:idle_shutdown")
    return "protecting unsaved work";
  return "continuing the current workflow without friction";
}

function inferNeed(event: CognitiveEvent, goal: string): string {
  if (event.type === "terminal_error")
    return "a likely cause, a reversible fix, and enough explanation to keep moving";
  if (event.type === "clipboard_sensitive_data")
    return "quiet protection against leaking secrets";
  if (event.type.includes("battery"))
    return "a timely warning before work is lost";
  if (
    event.type.includes("disk") ||
    event.type.includes("memory") ||
    event.type.includes("cpu")
  ) {
    return "system relief without disrupting the active task";
  }
  return `help with ${goal}`;
}

function suggestHelp(event: CognitiveEvent, goal: string): string[] {
  if (event.type === "terminal_error") {
    return [
      "explain the likely root cause",
      "prepare the safest next command",
      "check whether this has happened before",
    ];
  }
  if (event.type === "clipboard_sensitive_data") {
    return ["warn before paste", "suggest clearing clipboard after use"];
  }
  if (event.type.includes("disk"))
    return ["identify large temporary files", "suggest safe cleanup"];
  if (event.type.includes("memory") || event.type.includes("cpu"))
    return [
      "identify pressure source",
      "suggest closing or restarting only safe processes",
    ];
  return [`offer help with ${goal}`];
}

function suggestSilentPrep(event: CognitiveEvent, goal: string): string[] {
  if (event.type === "terminal_error")
    return ["search recent fixes in skill cache", "collect project metadata"];
  if (event.type.includes("disk"))
    return ["estimate reclaimable temp/cache space"];
  if (event.type.includes("wifi")) return ["check last known network state"];
  return [`keep context ready for ${goal}`];
}

function urgencyScore(event: CognitiveEvent): number {
  if (
    event.type.includes("battery") ||
    event.type.includes("crash") ||
    event.type.includes("wifi_disconnected")
  )
    return 0.9;
  if (
    event.type.includes("error") ||
    event.type.includes("disk") ||
    event.type.includes("memory")
  )
    return 0.65;
  if (event.type.includes("clipboard")) return 0.55;
  return 0.35;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
