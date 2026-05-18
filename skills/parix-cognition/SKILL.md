---
name: parix-cognition
description: Parix Skill - Cognition
---

# Parix Skill - Cognition

> Use when working on Parix's desire inference, long-context memory, hypothesis generation, planning, critique, and learning loops.

## Cognitive Goal

Parix should infer what the user wants from context, not wait for explicit commands.

Core loop:

```text
perceive -> compress context -> infer desire -> generate hypotheses
  -> gather evidence -> simulate actions -> critique -> decide
  -> act -> observe outcome -> update beliefs
```

## Memory Layers

- Working memory: current task, active blockers, assumptions, uncertainty.
- Episodic memory: session narratives and outcomes.
- Semantic memory: durable facts about the user, tools, projects, and preferences.
- Procedural memory: reusable skills and successful workflows.
- World memory: machine, project, app, service, repo, and company state.

## Desire Inference

The desire model should produce:

```typescript
{
  inferredGoal: string;
  userNeed: string;
  evidence: string[];
  confidence: number;
  suggestedHelp: string[];
  silentPrep: string[];
  interrupt: boolean;
  reasonToInterrupt?: string;
}
```

## Attention Policy

Interrupt only when usefulness beats interruption cost.

Score:

```text
confidence + urgency + preference_match + reversibility + novelty
  - interruption_cost - recent_nudge_penalty
```

Silent preparation is preferred when confidence is useful but interruption is not.

## Files

| File | Purpose |
|------|---------|
| `atrium/src/cognition/working-memory.ts` | Active situation compression |
| `atrium/src/cognition/user-model.ts` | Preferences and durable user facts |
| `atrium/src/cognition/world-model.ts` | Machine/project/world facts |
| `atrium/src/cognition/desire.ts` | Infers user goal and need |
| `atrium/src/cognition/hypotheses.ts` | Competing explanations |
| `atrium/src/cognition/simulator.ts` | Predicts action outcomes |
| `atrium/src/cognition/critic.ts` | Challenges weak or risky plans |
| `atrium/src/cognition/learning.ts` | Updates beliefs from outcomes |
| `atrium/src/cognition/index.ts` | Orchestrates the cognitive pass |
