# Cognition Module Quick Reference

## Core Loop

```
perceive -> compress context -> infer desire -> generate hypotheses
  -> gather evidence -> simulate actions -> critique -> decide
  -> act -> observe outcome -> update beliefs
```

## Memory Layers

| Layer       | Scope                                      | Persistence |
|-------------|--------------------------------------------|-------------|
| Working     | Current task, blockers, assumptions        | Session     |
| Episodic    | Session narratives and outcomes            | Durable     |
| Semantic    | User facts, tool knowledge, preferences    | Durable     |
| Procedural  | Reusable skills and workflows              | Durable     |
| World       | Machine, project, app, service state       | Durable     |

## Key Source Files

| File                              | Purpose                        |
|-----------------------------------|--------------------------------|
| `cognition/working-memory.ts`     | Active situation compression   |
| `cognition/user-model.ts`         | User preferences and facts     |
| `cognition/world-model.ts`        | Machine/project/world facts    |
| `cognition/desire.ts`             | Infers user goal and need      |
| `cognition/hypotheses.ts`         | Competing explanations         |
| `cognition/simulator.ts`          | Predicts action outcomes       |
| `cognition/critic.ts`             | Challenges weak/risky plans    |
| `cognition/learning.ts`           | Updates beliefs from outcomes  |
| `cognition/index.ts`              | Orchestrates the cognitive pass|

## Attention Score Formula

```
confidence + urgency + preference_match + reversibility + novelty
  - interruption_cost - recent_nudge_penalty
```

Interrupt user only when score > threshold. Otherwise, do silent preparation.
