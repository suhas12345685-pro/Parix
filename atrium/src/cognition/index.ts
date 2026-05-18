import { v4 as uuid } from "uuid";
import type {
  CognitiveDecision,
  CognitiveEvent,
  CognitiveSnapshot,
} from "./types.js";
import { getWorkingMemory, updateWorkingMemory } from "./working-memory.js";
import { getUserPreferences, observeUserPreference } from "./user-model.js";
import { getWorldFacts, observeWorld } from "./world-model.js";
import { inferDesire } from "./desire.js";
import { generateHypotheses } from "./hypotheses.js";
import { proposeActions, simulateActions } from "./simulator.js";
import { critiqueActions } from "./critic.js";
import { learnFromDecision } from "./learning.js";
import { recordCognitiveEpisode } from "./store.js";
import {
  gate,
  getAttentionState,
  getAttentionStats,
  setFocus,
} from "./attention.js";
import { assess as metacogAssess } from "./metacognition.js";
import { getAllActiveTrees, getProgress } from "./planner/index.js";
import { lookupSkill } from "../intelligence/skillcache.js";
import { matchSkills } from "../intelligence/skill-registry.js";
import { getDb } from "../memory/db.js";

let lastSnapshot: CognitiveSnapshot | null = null;

export function runCognition(event: CognitiveEvent): CognitiveSnapshot | null {
  const precheckMemory = getWorkingMemory();
  const verdict = gate(event, precheckMemory);
  logAttentionVerdict(event, verdict.admit, verdict.reason);

  if (!verdict.admit) {
    return null;
  }

  observeWorld(event);
  observeUserPreference(event);

  const workingMemory = updateWorkingMemory(event);
  const preferences = getUserPreferences();
  const worldFacts = getWorldFacts();
  const desire = inferDesire(event, workingMemory, preferences, worldFacts);
  const hypotheses = generateHypotheses(event, desire, workingMemory);
  const candidateActions = proposeActions(desire, hypotheses);
  const simulations = simulateActions(candidateActions, hypotheses);
  const critiques = critiqueActions(candidateActions, simulations, desire);
  const recommendedAction =
    candidateActions.find(
      (action) =>
        critiques.find((critique) => critique.actionId === action.id)?.approved,
    ) ?? candidateActions[candidateActions.length - 1];
  const activeTrees = getAllActiveTrees();
  const skillMatches = matchSkills(event);
  const hasCache =
    !!lookupSkill(event.type, event.data) || skillMatches.length > 0;
  const metacognition = metacogAssess(
    desire,
    hypotheses,
    workingMemory,
    activeTrees,
    hasCache,
  );

  // Every applicable skill becomes a tool call. Council fans these out
  // in parallel under the per-task cap; one match still works fine and
  // mirrors the old single-skill behavior.
  const toolCalls = skillMatches.map((reg) => ({
    skillId: reg.manifest.id,
    inputs: { ...(event.data ?? {}) },
    reversibility: reg.manifest.reversibility,
  }));

  const decision: CognitiveDecision = {
    mode:
      metacognition.strategy === "reflex"
        ? "reflex"
        : metacognition.strategy === "deliberate"
          ? "normal"
          : metacognition.strategy === "defer"
            ? "research"
            : "deep",
    desire,
    hypotheses,
    simulations,
    critiques,
    recommendedAction,
    toolCalls,
    confidence: Math.min(
      1,
      (desire.confidence + (hypotheses[0]?.confidence ?? 0.5)) / 2,
    ),
    shouldAct: recommendedAction.taskType !== "none",
    shouldInterrupt:
      metacognition.strategy === "ask_user" ||
      (recommendedAction.taskType === "notification" && desire.interrupt),
  };

  if (desire.confidence > 0.7 && desire.inferredGoal) {
    setFocus(desire.inferredGoal);
  }

  learnFromDecision(decision);

  recordCognitiveEpisode(
    uuid(),
    event.type,
    desire.inferredGoal,
    JSON.stringify(desire),
    JSON.stringify(hypotheses),
    JSON.stringify(decision),
  );

  const attentionStats = getAttentionStats();
  lastSnapshot = {
    workingMemory,
    preferences,
    worldFacts,
    decision,
    attention: {
      focus: attentionStats.focus,
      strength: attentionStats.focusStrength,
      admitRate: attentionStats.admitRate,
      suppressedCount: attentionStats.suppressedCount,
    },
    attentionState: getAttentionState(),
    metacognition,
    activePlan: activeTrees[0] ? getProgress(activeTrees[0]) : undefined,
  };
  return lastSnapshot;
}

export function getLastCognitiveSnapshot(): CognitiveSnapshot | null {
  return lastSnapshot;
}

function logAttentionVerdict(
  event: CognitiveEvent,
  admitted: boolean,
  reason: string,
): void {
  try {
    const attention = getAttentionStats();
    getDb().run(
      `INSERT INTO attention_log (event_type, admitted, reason, focus, focus_strength)
       VALUES (?, ?, ?, ?, ?)`,
      [
        event.type,
        admitted ? 1 : 0,
        reason,
        attention.focus,
        attention.focusStrength,
      ],
    );
  } catch {
    // Cognition can run in isolated tests before DB initialization.
  }
}

export type {
  CognitiveDecision,
  CognitiveEvent,
  CognitiveSnapshot,
  DesireInference,
  Hypothesis,
  WorkingMemory,
} from "./types.js";
