# Dependency Foresight Hook - Implementation Plan

## Objective

Implement the first pre-error Seventh Sense feature: Dependency Foresight.

The hook should prefer import-scanning over error-watching. Parix should notice a
new unresolved import or dependency manifest gap and prepare a shadow draft
before the terminal has a chance to produce `MODULE_NOT_FOUND` or similar stderr.

This stays inside cognition System 1.6 (`atrium/src/cognition/pulse/`) and keeps
Error-Shadow as the later fallback.

## Current Architecture Read

Scanned:

- `atrium/src/cognition/**`
- `atrium/src/intelligence/skill-registry.ts`
- `atrium/src/intelligence/skill-runner.ts`
- existing skill/test paths that handle dependency failures
- checked for `atrium/src/tools`, root `src/tools`, and `tools/`

There is no `src/tools` directory in this repo. The practical tool boundary is:

- cognition emits `decision.toolCalls`
- `intelligence/skill-registry.ts` matches skills to events
- `intelligence/skill-runner.ts` executes skill entrypoints
- Hands executors live under `hands/executor/`

Existing Error-Shadow shape:

- `atrium/src/cognition/index.ts` calls `maybeCreateErrorShadow(event)` before
  the attention gate.
- `atrium/src/cognition/pulse/error-shadow.ts` writes drafts under
  `shadow_drafts/technical/error-shadow/`.
- `pulse_memory` stores `last_error_shadow`.
- `error_shadow_drafts` stores durable metadata and notification score.

Dependency Foresight should mirror this shape, but run before Error-Shadow.

## Architecture Decisions

### 1. Add a small Pulse precompute orchestrator

Create:

```text
atrium/src/cognition/pulse/precompute.ts
```

Responsibility:

- Run all pre-attention, zero-footprint Pulse hooks.
- Enforce priority order:
  1. Dependency Foresight
  2. Error-Shadow
- Return a small result object for tests and future Aegis display.

`runCognition(event)` will call:

```typescript
runPulsePrecompute(event);
```

instead of directly calling `maybeCreateErrorShadow(event)`.

This avoids turning `cognition/index.ts` into a god file.

### 2. Add a separate Dependency Foresight service

Create:

```text
atrium/src/cognition/pulse/dependency-foresight.ts
atrium/src/cognition/pulse/import-scanner.ts
atrium/src/cognition/pulse/manifest-reader.ts
atrium/src/cognition/pulse/dependency-types.ts
```

Responsibilities:

- `import-scanner.ts`
  - Pure parsing, no DB, no filesystem writes.
  - Extract imports from TypeScript/JavaScript:
    - `import x from "pkg"`
    - `import "pkg"`
    - `await import("pkg")`
    - `require("pkg")`
  - Extract Python imports:
    - `import pkg`
    - `from pkg import x`
  - Ignore:
    - relative paths (`./`, `../`)
    - absolute local paths
    - Node builtins (`fs`, `path`, `crypto`, `node:*`)
    - obvious local aliases unless configured later

- `manifest-reader.ts`
  - Locate nearest dependency manifest from file cwd:
    - Node: `package.json`
    - Python: `requirements.txt`, `pyproject.toml`
  - Read dependency names without installing anything.
  - Keep v1 conservative: no network calls, no `npm install`, no package manager mutations.

- `dependency-foresight.ts`
  - Given a cognitive event, decide whether import scanning is possible.
  - Supported event data in v1:
    - `file_path`
    - `filePath`
    - `changed_files`
    - `changedFiles`
    - `cwd`
    - `content` when supplied by a future observer
  - If no file context exists, do nothing.
  - Compare external imports to manifests.
  - Write a draft if one or more imports look missing.
  - Persist metadata.
  - Update Pulse memory.

### 3. Use SQLite for crash-safe short-term memory

Add schema:

```sql
CREATE TABLE IF NOT EXISTS dependency_foresight_drafts (
  id TEXT PRIMARY KEY,
  import_hash TEXT NOT NULL,
  cwd TEXT,
  file_path TEXT,
  manifest_path TEXT,
  missing_imports_json TEXT NOT NULL,
  draft_path TEXT NOT NULL,
  suggested_commands_json TEXT,
  confidence REAL NOT NULL,
  notification_score REAL NOT NULL,
  notification_channel TEXT NOT NULL DEFAULT 'silent',
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
```

Indexes:

- `idx_dependency_foresight_hash`
- `idx_dependency_foresight_last_seen`

Pulse memory keys:

- `last_dependency_foresight`
- optionally `dependency_foresight:<hash>` for repeat tracking

Every write calls `persistToFile()` immediately, matching Error-Shadow.

### 4. Draft output stays zero-footprint

Drafts go to:

```text
shadow_drafts/technical/dependency-foresight/
```

Draft format:

- title
- source file
- manifest checked
- imports found missing
- why Parix thinks they are missing
- suggested commands
- safe next steps
- confidence and notification score

Example suggested command:

```text
npm install lodash
```

But this is only written as a recommendation. It is not executed.

### 5. Notification fatigue policy

Default behavior is silent draft.

Notify only when:

- confidence >= 0.88, and
- missing import is external, direct, and used in a source file, and
- the manifest exists and clearly lacks the package, and
- the same import gap has appeared at least twice or touches an active changed file.

Cooldown:

- 60 minutes for the same import hash.

Notification text:

```text
Suhas, I sensed a dependency gap before it became a terminal error.
I've already drafted the fix in [draft_path]. Suggested next step: [command].
```

This keeps Error-Shadow from becoming noisy; dependency foresight is higher
signal because it is tied to source imports, not raw terminal output.

### 6. Priority over Error-Shadow

`precompute.ts` runs:

```typescript
const dependency = maybeCreateDependencyForesight(event);
const errorShadow = maybeCreateErrorShadow(event);
```

If the event has both file/import context and terminal stderr, Dependency
Foresight still runs first and writes `last_dependency_foresight` before
Error-Shadow writes `last_error_shadow`.

In tests, we will verify the precompute result order is:

```text
["dependency_foresight", "error_shadow"]
```

No direct coupling between the services. They remain separate.

## File Structure

Planned new files:

```text
atrium/src/cognition/pulse/dependency-types.ts
atrium/src/cognition/pulse/import-scanner.ts
atrium/src/cognition/pulse/manifest-reader.ts
atrium/src/cognition/pulse/dependency-foresight.ts
atrium/src/cognition/pulse/precompute.ts
atrium/src/cognition/pulse/__tests__/dependency-foresight.test.ts
```

Planned changed files:

```text
atrium/src/cognition/index.ts
shared/schema.sql
COGNITION-UPGRADE.md
```

No file should exceed 600 lines. The largest expected file is
`dependency-foresight.ts`, and it should stay under 350 lines by keeping parsing
and manifest reading separate.

## Event Contract

Dependency Foresight should respond to source/file-oriented events such as:

```typescript
{
  type: "file_changed" | "workspace_changed" | "import_scan" | string,
  data: {
    cwd?: string;
    file_path?: string;
    filePath?: string;
    changed_files?: string[];
    changedFiles?: string[];
    content?: string;
  },
  confidence: number;
  timestamp: number;
}
```

It may also run during terminal errors if the event includes source file context,
but that is fallback behavior. Import/file events are the primary trigger.

## Potential Breaking Points

1. Path safety
   - Must resolve file paths and ensure reads stay inside the workspace/cwd.
   - Avoid scanning arbitrary absolute paths from untrusted event data.

2. Import parsing false positives
   - Regex parsing is acceptable for v1 because the hook is advisory.
   - Do not mutate manifests or run installs based on scanner output.

3. Package name mapping
   - Scoped packages (`@scope/pkg`) must remain intact.
   - Subpath imports (`lodash/fp`, `@scope/pkg/subpath`) should map to package
     root (`lodash`, `@scope/pkg`).

4. Monorepo manifests
   - Nearest `package.json` may not contain the dependency if the root workspace
     owns it. v1 should check nearest first, then repo root `package.json`.

5. Python import names
   - Import name does not always equal package name. v1 should handle obvious
     cases only and mark Python findings as lower confidence.

6. Notification noise
   - A single missing import draft stays silent.
   - Notification requires high score and cooldown.

7. Existing typecheck failure
   - Current full Atrium typecheck is already blocked by unrelated missing
     `skill-permissions` exports:
     - `registerUserCreatedSkillPermissions`
     - `clearUserCreatedSkillPermissions`
     - `isUserCreatedSkill`
   - Implementation tests should still run focused Vitest paths.
   - If full `npm test` fails for the same unrelated reason, document it
     separately rather than hiding it.

## Test Plan

Focused tests:

```text
atrium/src/cognition/pulse/__tests__/dependency-foresight.test.ts
```

Cases:

1. Extract JS/TS imports:
   - static import
   - side-effect import
   - dynamic import
   - require

2. Ignore non-package imports:
   - `./local`
   - `../relative`
   - `node:fs`
   - `fs`

3. Map subpath imports:
   - `lodash/fp` -> `lodash`
   - `@scope/pkg/sub/path` -> `@scope/pkg`

4. Detect missing package:
   - create temp project with `package.json`
   - source imports missing package
   - expect draft file and DB row

5. Do not flag declared package:
   - package exists in dependencies/devDependencies
   - expect no draft

6. Persist across restart:
   - create draft
   - close/reopen DB
   - read last dependency foresight metadata

7. Priority over Error-Shadow:
   - event contains both import context and stderr
   - `runPulsePrecompute(event)` returns dependency result before error result

Verification commands after implementation:

```powershell
npm test --workspace=atrium -- src/cognition/pulse/__tests__/dependency-foresight.test.ts src/cognition/pulse/__tests__/error-shadow.test.ts src/cognition/__tests__/cognition.test.ts
npm test --workspace=atrium
```

If `npm test --workspace=atrium` fails due to existing unrelated
`skill-permissions` exports, keep the focused feature tests green and report the
known blocker.

## Execution Notes After Approval

Implementation should happen in normal source files, while generated feature
drafts remain under `shadow_drafts/`. No dependency install commands should run.

The code should be boring, small, and easily removable:

- no new external packages
- no changes to Hands executors
- no changes to skill runner
- no LLM call
- no manifest mutation
- no command execution

Status: awaiting approval.
