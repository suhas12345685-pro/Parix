# Skill Directory Structure Reference

Every Parix skill must follow this layout:

```
skills/{skill-id}/
├── SKILL.md          # Core instructions & metadata (required)
├── scripts/          # Automation scripts (Python, JS, Bash)
├── references/       # Domain documentation or style guides
└── templates/        # Target formats, JSON schemas, layouts
```

## SKILL.md Frontmatter

```yaml
---
name: skill-id
description: One-line description of what the skill does
---
```

## Registry Entry

Each skill must be registered in `skills/registry.json`:

```json
{
  "id": "skill-id",
  "path": "skills/skill-id/SKILL.md",
  "scope": "task|platform|hands|atrium|core"
}
```

## Scope Values

| Scope | Meaning |
|---|---|
| platform | OS detection and platform-specific behavior |
| hands | Python-side sensors, executors, accessibility |
| atrium | Node.js-side intelligence, council, LLM |
| channels | Notification channel adapters |
| task | User-facing task automation |
| core | Internal Parix infrastructure |
