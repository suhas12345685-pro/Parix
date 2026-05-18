import { v4 as uuid } from "uuid";
import type {
  CognitiveEvent,
  DesireInference,
  Hypothesis,
  WorkingMemory,
} from "./types.js";

export function generateHypotheses(
  event: CognitiveEvent,
  desire: DesireInference,
  memory: WorkingMemory,
): Hypothesis[] {
  const hypotheses: Hypothesis[] = [];

  if (event.type === "terminal_error") {
    hypotheses.push(
      make(
        "missing dependency or package resolution issue",
        event,
        ["terminal_error", desire.inferredGoal],
        0.72,
        ["package manager output", "project manifest"],
      ),
      make(
        "wrong working directory or environment mismatch",
        event,
        ["cwd/project context"],
        0.52,
        ["current directory", "runtime versions"],
      ),
      make(
        "network or registry/service dependency failed",
        event,
        ["command failed"],
        0.42,
        ["network status", "registry URL"],
      ),
    );
  } else if (event.type === "clipboard_sensitive_data") {
    hypotheses.push(
      make(
        "user is configuring provider credentials",
        event,
        ["secret-like clipboard"],
        0.7,
        ["active app", "target field"],
      ),
      make(
        "secret may be accidentally exposed during copy/paste",
        event,
        ["secret-like clipboard"],
        0.58,
        ["paste destination"],
      ),
    );
  } else if (event.type.includes("disk")) {
    hypotheses.push(
      make(
        "disk pressure could block builds or downloads",
        event,
        memory.blockers,
        0.75,
        ["largest safe cleanup candidates"],
      ),
      make(
        "temporary/cache files may be safe to remove",
        event,
        ["disk low"],
        0.55,
        ["cache sizes"],
      ),
    );
  } else {
    hypotheses.push(
      make(
        `user likely wants ${desire.userNeed}`,
        event,
        desire.evidence,
        desire.confidence,
        ["more context"],
      ),
    );
  }

  // Boost hypotheses whose explanation tokens overlap with the focused UI
  // element's role/name. Accessibility tells us what's on screen — if a
  // hypothesis names the same thing, it deserves a small credibility bump.
  const focused = memory.focusedElement;
  if (focused) {
    const focusTokens = tokenize(
      `${focused.role} ${focused.name} ${focused.value ?? ""}`,
    );
    for (const h of hypotheses) {
      const explTokens = tokenize(h.explanation);
      const overlap = jaccard(focusTokens, explTokens);
      if (overlap > 0) {
        const bump = Math.min(0.15, overlap * 0.3);
        h.confidence = Math.min(1, h.confidence + bump);
        h.evidence = [`focused_ui_overlap:${overlap.toFixed(2)}`, ...h.evidence].slice(
          0,
          8,
        );
      }
    }
  }

  return hypotheses.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  if (inter === 0) return 0;
  return inter / (a.size + b.size - inter);
}

function make(
  explanation: string,
  event: CognitiveEvent,
  evidence: string[],
  confidence: number,
  missingEvidence: string[],
): Hypothesis {
  return {
    id: uuid(),
    explanation,
    evidence: [`event:${event.type}`, ...evidence].slice(0, 8),
    confidence,
    missingEvidence,
  };
}
