# Parix Ship Readiness

Last verified: 2026-05-22 11:25 +05:30

## Current decision

Parix is ready to push as a `v0.2.0-alpha` ship candidate after human review of the current dirty worktree. The automated gates below passed on this machine.

This is not a production/GA sign-off. It is an alpha readiness sign-off with clear remaining work.

## Verification results

| Check | Command | Result |
| --- | --- | --- |
| Full local ship gate | `npm run verify:ship` | Pass |
| Workspace build | `npm run build:all` | Pass |
| Atrium unit/integration tests | `npm test` | Pass: 41 files, 211 tests |
| Lint | `npm run lint` | Pass |
| Skill manifest validation | `npm run skills:validate` | Pass: 18 task skill manifests |
| End-to-end harness | `npm run test:e2e` | Pass: 14 checks |
| Atrium coverage run | `npm run test:coverage` | Pass: 41 files, 211 tests |
| Hands Python tests | `python -m pytest hands/tests` | Pass: 105 tests |
| Hands Python compile | `python -m compileall hands` | Pass |
| Dependency audit | `npm audit --audit-level=high` | Pass at high level; 3 moderate `uuid` advisories remain |

Coverage from the latest run:

| Metric | Result |
| --- | --- |
| Statements | 66.04% |
| Branches | 58.69% |
| Functions | 73.58% |
| Lines | 67.48% |

## Systems updated

- TypeScript workspaces build cleanly: `shared`, `atrium`, `hatchery`, and `aegis`.
- Push-readiness is wired through `npm run verify:ship`, backed by `scripts/verify-ship.mjs`.
- GitHub CI is wired to install `hands/requirements-dev.txt`, run the workspace build, lint, Atrium tests, skill validation, Hands tests, and Python compile on Ubuntu, macOS, and Windows.
- The release validation job now uses the same real local gates and no longer references missing Python requirement files.
- Hands Docker image build/runtime wiring includes PortAudio system packages, and the Hands container health check now probes the WebSocket port instead of a non-existent HTTP endpoint.
- Atrium state, cognition, Synapse, LLM routing, skill routing, Aegis relay, and SQLite lifecycle tests are green.
- Hands WebSocket bridge, auth, accessibility, vision, watcher, CLI executor, shadow loop, and stress tests are green.
- The scripted e2e flow boots Hands and Atrium, processes a terminal error sensor event, reaches a successful action lifecycle, verifies Aegis pause/resume, and confirms SQLite lifecycle records.
- Skill marketplace manifests validate successfully.

## What is left before GitHub push

- Review and intentionally stage the current large dirty worktree. The branch is `main` and is currently ahead of `origin/main` by 13 commits.
- Confirm the deleted legacy workflow files are intentional; release packaging is now consolidated into `.github/workflows/release.yml`:
  - `.github/workflows/installers.yml`
  - `.github/workflows/release-binaries.yml`
- Decide whether to accept or fix the moderate `uuid` audit advisories. `npm audit fix --force` would install `uuid@14.0.0` and is a breaking-change path, so this should be handled deliberately.
- Run a live channel smoke test with real secrets if the release promise includes Telegram, Slack, Discord, or other external delivery. The current e2e run used the mock/local profile and skipped Telegram because env credentials were not present.
- Do a final secrets check before publishing. `.env` exists locally and should stay ignored.
- Create a release branch or push the current branch once the reviewed file set is staged.
- Open a GitHub PR/release candidate and have Claude or another reviewer check the large cross-module changes before merge.

## Noted caveats

- The automated e2e output included one non-fatal log rendering issue: a warning line printed a replacement character in `Bridge disconnected ... waiting for Atrium reconnect`. It did not affect behavior, but it is worth cleaning up before a polished demo.
- A standalone Hatchery Vitest file exists under `hatchery/tests/schema.test.ts`, but the repo root Vitest config intentionally includes only Atrium tests. The shared/Hatchery code still compiled successfully through `npm run build:all`.
- External APIs, installer signing, GitHub Actions release workflows, and live desktop notification behavior were not proven by these local checks.

## Ship status

Alpha push candidate: yes.

Production-ready claim: no, not until the remaining external-channel, release-workflow, audit, and review items above are closed.
