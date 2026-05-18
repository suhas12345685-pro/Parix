# Security Alert Quick Reference

## Detected Credential Patterns

| Type | Pattern Example | Urgency |
|---|---|---|
| OpenAI API key | `sk-...` (20+ chars) | High |
| Google API key | `AIza...` (20+ chars) | High |
| GitHub token | `ghp_...` (20+ chars) | High |
| AWS Access Key | `AKIA` + 16 uppercase | Critical |
| Password assignment | `password=...` | High |
| Generic token | `token=...` or `secret=...` | Medium |
| JWT | `eyJ...` base64 segments | Medium |

## Response Protocol

1. **Detect** — pattern match on clipboard/logs
2. **Classify** — determine credential type and urgency
3. **Notify** — alert user immediately (never log the value)
4. **Suggest** — recommend clearing clipboard or rotating key
5. **Never** store, transmit, or display the actual credential

## Parix Security Rules
- Only detect presence, never store content
- Log category only: "api_key detected" not the key itself
- Clipboard monitoring is opt-in (default: OFF in Hatchery)
- File system credential scanning is future scope
