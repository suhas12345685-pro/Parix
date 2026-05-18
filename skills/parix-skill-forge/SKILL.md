---
name: parix-skill-forge
description: Auto-generates new Parix skills on demand
---

# Parix Skill Forge (Auto-Skill Creator)

> Allows Parix to autonomously generate new skills when it encounters a recurring problem it lacks a specific skill for.

## Instructions

1. Identify that a recurring issue or missing capability exists.
2. Run scripts/forge.py --name <skill-name> --desc "<description>" --scope <scope>
3. The script will dynamically generate the new skill directory, layout the SKILL.md, and register it in egistry.json.

## When to use
Whenever Parix needs to retain an execution strategy or domain knowledge permanently.
