## 📋 Pull Request Checklist

### Description
<!-- What does this PR do? Link related issues with "Closes #___" -->

### Type of Change
- [ ] 🐞 Bug fix (non-breaking change that fixes an issue)
- [ ] ✨ New feature (non-breaking change that adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to change)
- [ ] 📝 Documentation update
- [ ] ♻️ Refactor (no functional changes)
- [ ] 🧪 Test only (adding or updating tests)

### Module(s) Affected
- [ ] `atrium/` — Brain (Node.js/TypeScript)
- [ ] `hands/` — Executor (Python)
- [ ] `shared/` — Protocol / Schema
- [ ] `aegis/` — Web UI
- [ ] `hatchery/` — CLI Onboarding
- [ ] `deploy/` — Infrastructure
- [ ] `qa/` — Test suites

---

### Pre-Merge Checklist

#### Code Quality
- [ ] My code follows the Parix style guidelines
- [ ] I have performed a self-review of my code
- [ ] I have added comments for non-obvious logic
- [ ] No `console.log` / `print()` debugging left in production code

#### Testing
- [ ] I have added unit tests covering my changes
- [ ] All existing tests pass locally (`npm run test` / `pytest`)
- [ ] Integration tests pass if Synapse bridge is involved
- [ ] I have tested on my target OS (Windows / macOS / Linux)

#### Protocol & Schema
- [ ] Changes are backward-compatible with `shared/protocol.json`
- [ ] If `protocol.json` was modified, both Atrium and Hands are updated
- [ ] If `schema.sql` was modified, migration path is documented

#### Security (for Hands/Executor changes)
- [ ] No `shell=True` with user-controlled input in `subprocess` calls
- [ ] No hardcoded secrets or API keys
- [ ] Preflight capability checks are present for new actions
- [ ] Constitution layer constraints are respected

#### Council State Machine (if applicable)
- [ ] State transitions are documented
- [ ] No new state added without updating the Council spec
- [ ] PARALYZED state fallback is handled

#### LLM Adapter (if applicable)
- [ ] Adapter implements the full `LLMAdapter` interface from `types.ts`
- [ ] Fallback behavior is tested
- [ ] Token usage is tracked via `token_governor`
- [ ] Mock adapter tests pass

---

### Screenshots / Logs
<!-- If applicable, add screenshots or log output showing the change in action. -->

### Reviewer Notes
<!-- Anything specific you'd like the reviewer to focus on? -->
