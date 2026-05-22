import { v4 as uuid } from "uuid";
import type { CognitiveEvent } from "../cognition/types.js";
import type { ActionIR, NeuroFact } from "./types.js";
import { normalizeAction } from "./lukasiewicz.js";

function truth(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function textFromData(data: Record<string, unknown>): string {
  return [
    data.error,
    data.output,
    data.stderr,
    data.message,
    data.command,
  ]
    .filter((value) => typeof value === "string")
    .join("\n");
}

function fact(
  predicate: string,
  args: string[],
  truthValue: number,
  evidence?: string[],
): NeuroFact {
  return {
    predicate,
    args,
    truth: truth(truthValue),
    source: "local",
    evidence,
  };
}

export function perceiveLocally(event: CognitiveEvent): NeuroFact[] {
  const facts: NeuroFact[] = [
    fact("EventType", [event.type], 1, [`sensor:${event.type}`]),
    fact("Confidence", [event.type], event.confidence, [
      `confidence:${event.confidence.toFixed(2)}`,
    ]),
  ];
  const text = textFromData(event.data);
  const lower = text.toLowerCase();

  if (event.confidence >= 0.75) facts.push(fact("HighConfidence", [event.type], event.confidence));
  if (event.type.includes("terminal_error")) facts.push(fact("TerminalError", ["event"], event.confidence));
  if (/module_not_found|cannot find module|no module named/.test(lower)) {
    facts.push(fact("MissingDependency", ["project"], 0.9, ["module import failure"]));
  }
  if (/eacces|permission denied|access is denied/.test(lower)) {
    facts.push(fact("PermissionFailure", ["project"], 0.86, ["permission error"]));
  }
  if (/enospc|no space left|disk.*full/.test(lower)) {
    facts.push(fact("DiskPressure", ["host"], 0.92, ["space exhaustion"]));
  }
  if (event.type.includes("disk")) facts.push(fact("DiskPressure", ["host"], event.confidence));
  if (event.type.includes("cpu")) facts.push(fact("CpuPressure", ["host"], event.confidence));
  if (event.type.includes("memory") || event.type.includes("swap")) {
    facts.push(fact("MemoryPressure", ["host"], event.confidence));
  }
  if (event.type.includes("battery")) facts.push(fact("BatteryRisk", ["host"], event.confidence));
  if (event.type.includes("clipboard")) facts.push(fact("SensitiveClipboard", ["host"], event.confidence));
  if (event.type.includes("wifi")) facts.push(fact("NetworkContextChanged", ["host"], event.confidence));
  if (event.type.includes("app_crash") || event.type.includes("app_hang")) {
    facts.push(fact("ApplicationInstability", [String(event.data.app ?? "unknown")], event.confidence));
  }

  return facts;
}

function hasFact(facts: NeuroFact[], predicate: string): boolean {
  return facts.some((candidate) => candidate.predicate === predicate && candidate.truth >= 0.6);
}

function notification(title: string, body: string, urgency: string, event: CognitiveEvent, utility = 0.65): ActionIR {
  return normalizeAction({
    id: uuid(),
    kind: "notification",
    payload: { title, body, urgency },
    confidence: event.confidence,
    utility,
    risk: 0.05,
    reversibility: 1,
    explanation: body,
    capabilities: ["notify"],
    provenance: ["local"],
  });
}

export function proposeLocally(event: CognitiveEvent, facts: NeuroFact[]): ActionIR[] {
  const data = event.data;
  const candidates: ActionIR[] = [];

  if (hasFact(facts, "TerminalError")) {
    if (hasFact(facts, "MissingDependency")) {
      candidates.push(
        normalizeAction({
          id: uuid(),
          kind: "cli",
          payload: { argv: ["npm", "install"] },
          confidence: Math.min(0.92, event.confidence),
          utility: 0.78,
          risk: 0.22,
          reversibility: 0.8,
          explanation: "Install missing project dependencies after a module resolution failure.",
          capabilities: ["repo.write", "network.package_registry"],
          provenance: ["local"],
        }),
      );
    }

    if (hasFact(facts, "PermissionFailure")) {
      candidates.push(
        notification(
          "Permission Failure",
          "A command failed because of permissions. I can inspect the failing path before changing access bits.",
          "high",
          event,
          0.72,
        ),
      );
    }

    candidates.push(
      notification(
        "Terminal Error",
        `A terminal command failed${data.command ? `: ${data.command}` : ""}.`,
        "medium",
        event,
        0.58,
      ),
    );
  }

  if (hasFact(facts, "DiskPressure")) {
    candidates.push(
      notification(
        "Disk Space Low",
        "Disk pressure detected. Review temp/cache cleanup before deleting files.",
        "high",
        event,
        0.7,
      ),
    );
  }

  if (hasFact(facts, "CpuPressure")) {
    candidates.push(
      notification(
        "High CPU Usage",
        `CPU usage is elevated${data.percent ?? data.cpu_percent ? ` at ${data.percent ?? data.cpu_percent}%` : ""}.`,
        "medium",
        event,
        0.62,
      ),
    );
  }

  if (hasFact(facts, "MemoryPressure")) {
    candidates.push(
      notification(
        "Memory Pressure",
        "Memory pressure detected. Consider closing heavy applications or deferring background work.",
        "medium",
        event,
        0.62,
      ),
    );
  }

  if (hasFact(facts, "SensitiveClipboard")) {
    candidates.push(
      notification(
        "Sensitive Clipboard",
        "The clipboard appears to contain sensitive data. Avoid pasting it into untrusted surfaces.",
        "high",
        event,
        0.84,
      ),
    );
  }

  if (hasFact(facts, "BatteryRisk")) {
    candidates.push(
      notification(
        "Battery Low",
        `Battery is low${data.percent ? ` at ${data.percent}%` : ""}. Save work soon.`,
        "high",
        event,
        0.75,
      ),
    );
  }

  if (hasFact(facts, "ApplicationInstability")) {
    candidates.push(
      notification(
        "Application Instability",
        `"${data.app ?? "An application"}" appears unstable.`,
        "medium",
        event,
        0.66,
      ),
    );
  }

  return candidates;
}

