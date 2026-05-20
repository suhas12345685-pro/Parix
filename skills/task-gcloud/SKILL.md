---
name: task-gcloud
description: Run a Google Cloud SDK (gcloud) command with auth-context awareness and operation-class detection. Refuses destructive commands unless dryRun=false is explicit.
---

# gcloud Wrapper

> Use when the user asks Parix to do something against Google Cloud
> via the `gcloud` CLI. This skill knows what's installed, who's
> logged in, what project is active, and whether the requested
> command is a read, a mutation, or a destroy.

## Why a wrapper instead of cli-executor

The generic `cli-executor` can run `gcloud` already — but it lacks
the auth context (which user/project/subscription is active right
now?) and the safety classification (is this `gcloud compute
instances list` or `gcloud compute instances delete --quiet`?).

This skill adds those two pieces:

1. **Auth + project detection** — before executing anything, it
   probes `gcloud --version`, `gcloud auth list`, and `gcloud config
   get-value project`. The output tells the council whether the
   user is even logged in, and against which project.
2. **Operation classification** — parses the argv tail against an
   allow/deny pattern table. `list`/`describe`/`get-*` are `read`,
   `create`/`add`/`update`/`set` are `mutate`, `delete`/`remove`/
   `destroy` are `destroy`. The skill refuses to run `destroy`
   commands when `dryRun=true` (the default) — the caller has to
   explicitly set `dryRun=false` to acknowledge the risk.

## Safety posture

- **Default is dry-run.** The skill reports what it would do, the
  classification, and the auth context, but does not execute.
- **Destroy needs explicit dryRun=false.** Even with `dryRun=false`,
  the constitution rules upstream (`gcloud.*delete` in
  [atrium/src/intelligence/constitution.ts](../atrium/src/intelligence/constitution.ts))
  may still block based on reversibility — that's a feature.
- **No `auth login` from this skill.** Authentication is a
  user-controlled flow. If `authenticated=false`, the skill reports
  it and refuses to proceed.

## Permissions

`process:read` (probe `gcloud --version` / `auth list`) +
`process:execute` (run the requested command when not in dry-run).

No filesystem or network permissions — `gcloud` makes its own
network calls internally, and the constitution governs whether the
overall request is allowed.
