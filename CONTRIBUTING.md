# Contributing

Thanks for helping make Parix sturdier. Keep changes small, testable, and
aligned with the existing package boundaries.

## Workflow

1. Fork or branch from the current mainline.
2. Create a focused branch, for example `feat/aegis-cognition-panel`.
3. Install dependencies with `npm ci`.
4. Make the smallest change that solves the issue.
5. Run the relevant checks before opening a pull request.
6. Open a PR with a clear summary, verification notes, and screenshots for UI
   changes.

## Local Checks

```powershell
npm run build --workspace=shared
npm run build --workspace=atrium
npm run build --workspace=aegis
npm test --workspace=atrium
python -m pytest hands/tests
```

If a check cannot run on your machine, include the command and failure reason
in the PR notes.

## Code Guidelines

- Preserve the contract in `shared/protocol.json` and `shared/schema.sql`.
- Keep Atrium reasoning code, Hands OS execution code, and Aegis UI code in
  their own workspaces.
- Prefer typed data structures over string parsing.
- Never use `shell=True` for user-provided commands in Python executors.
- Add focused tests for cognition, queueing, routing, and safety behavior.
- Keep generated build output out of hand-written changes unless the repo
  explicitly asks for it.

## Pull Request Checklist

- The change has a short, user-facing summary.
- Tests or a reason for not adding tests are included.
- New environment variables are documented in `.env.example`.
- UI changes have been checked at desktop and narrow widths.
- Safety-sensitive changes call out risks and rollback behavior.
