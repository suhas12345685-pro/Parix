import type { CognitiveEvent } from "../cognition/types.js";
import { normalizeAction, rankActions } from "./lukasiewicz.js";
import { NeuroSymbolicIpcClient } from "./ipc.js";
import { perceiveLocally, proposeLocally } from "./local-runtime.js";
import { evaluateActions } from "./symbolic-kernel.js";
import type {
  ActionIR,
  NeuroFact,
  NeuroSymbolicDecision,
  NeuroSymbolicSource,
  RuntimeContext,
} from "./types.js";

export interface NeuroSymbolicBridgeOptions {
  ipc?: NeuroSymbolicIpcClient;
}

function normalizeFacts(value: unknown, fallback: NeuroFact[]): NeuroFact[] {
  if (!Array.isArray(value)) return fallback;
  return value
    .filter((item): item is NeuroFact => {
      const candidate = item as Partial<NeuroFact>;
      return (
        typeof candidate.predicate === "string" &&
        Array.isArray(candidate.args) &&
        typeof candidate.truth === "number"
      );
    })
    .map((item) => ({
      ...item,
      truth: Math.max(0, Math.min(1, item.truth)),
      source: item.source ?? "python-sidecar",
    }));
}

function normalizeActions(value: unknown, fallback: ActionIR[]): ActionIR[] {
  if (!Array.isArray(value)) return fallback;
  return value
    .filter((item): item is ActionIR => {
      const candidate = item as Partial<ActionIR>;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.kind === "string" &&
        typeof candidate.payload === "object" &&
        candidate.payload !== null
      );
    })
    .map((item) => normalizeAction(item));
}

function sourceOfFacts(localFacts: NeuroFact[], facts: NeuroFact[]): NeuroSymbolicSource {
  if (facts !== localFacts && facts.some((fact) => fact.source === "python-sidecar")) {
    return "python-sidecar";
  }
  if (facts.some((fact) => fact.source === "synalinks")) return "synalinks";
  return "local";
}

function sourceOfActions(localActions: ActionIR[], actions: ActionIR[]): NeuroSymbolicSource {
  if (actions !== localActions && actions.some((action) => action.provenance.includes("python-sidecar"))) {
    return "python-sidecar";
  }
  if (actions.some((action) => action.provenance.includes("hybridagi"))) return "hybridagi";
  return "local";
}

export class NeuroSymbolicBridge {
  private ipc: NeuroSymbolicIpcClient;

  constructor(options: NeuroSymbolicBridgeOptions = {}) {
    this.ipc = options.ipc ?? new NeuroSymbolicIpcClient();
  }

  async decide(
    event: CognitiveEvent,
    runtime: RuntimeContext,
  ): Promise<NeuroSymbolicDecision> {
    const started = Date.now();
    const localFacts = perceiveLocally(event);
    const sidecarFacts = await this.ipc.request<
      { event: CognitiveEvent; context: Record<string, unknown> },
      NeuroFact[]
    >("perceive", { event, context: runtime.context });
    const facts = normalizeFacts(sidecarFacts, localFacts);

    const localActions = proposeLocally(event, facts);
    const sidecarActions = await this.ipc.request<
      { event: CognitiveEvent; facts: NeuroFact[]; context: Record<string, unknown> },
      ActionIR[]
    >("behavior_graph", {
      event,
      facts,
      context: runtime.context,
    });
    const candidates = normalizeActions(sidecarActions, localActions);

    const symbolicDecisions = evaluateActions(candidates, runtime);
    const scores = rankActions(symbolicDecisions);
    const selectedScore = scores.find((score) =>
      symbolicDecisions.some(
        (decision) =>
          decision.action?.id === score.actionId && decision.verdict !== "DENY",
      ),
    );
    const selectedDecision = selectedScore
      ? symbolicDecisions.find((decision) => decision.action?.id === selectedScore.actionId)
      : undefined;
    const selectedAction = selectedDecision?.action ?? null;

    const verdict =
      candidates.length === 0
        ? "NO_ACTION"
        : selectedDecision?.verdict ?? "DENY";

    return {
      action: selectedAction,
      verdict,
      reason:
        selectedDecision?.explanation ??
        (candidates.length === 0
          ? "No neuro-symbolic candidate action emerged."
          : "All candidate actions were denied by symbolic policy."),
      trace: {
        event,
        facts,
        candidates,
        symbolicDecisions,
        scores,
        selectedActionId: selectedAction?.id ?? null,
        verdict,
        latencyMs: Date.now() - started,
        sources: {
          perception: sourceOfFacts(localFacts, facts),
          behavior: sourceOfActions(localActions, candidates),
          optimizer: "local",
        },
      },
    };
  }
}

export function createDefaultNeuroSymbolicBridge(): NeuroSymbolicBridge {
  return new NeuroSymbolicBridge();
}
