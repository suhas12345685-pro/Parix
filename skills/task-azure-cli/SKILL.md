---
name: task-azure-cli
description: Run a Microsoft Azure CLI (az) command with auth-context awareness and operation-class detection. Refuses destructive commands unless dryRun=false is explicit.
---

# Azure CLI Wrapper

> Use when the user asks Parix to do something against Azure via
> the `az` CLI. This skill knows what's installed, who's logged in,
> which subscription is active, and whether the requested command
> is a read, a mutation, or a destroy.

## Why a wrapper instead of cli-executor

The generic `cli-executor` can run `az` already — but it lacks the
auth context (which subscription is active? which tenant?) and the
safety classification (is this `az vm list` or `az vm delete --yes
--no-wait`?). This skill adds:

1. **Auth + subscription + tenant detection** — probes
   `az --version` and `az account show --output json`. The output
   tells the council whether the user is even logged in, and
   against which subscription/tenant.
2. **Operation classification** — parses the argv tail against an
   allow/deny pattern table. `list`/`show`/`query` are `read`,
   `create`/`update`/`set`/`enable` are `mutate`, `delete`/`remove`
   are `destroy`. The skill refuses to run `destroy` commands when
   `dryRun=true` (default).

## Safety posture

- **Default is dry-run.** Same as `task-gcloud` — reports what
  would happen, classification, and auth context without executing.
- **Destroy needs explicit dryRun=false.** And even then, the
  upstream constitution rule (`az.*delete` in
  [atrium/src/intelligence/constitution.ts](../atrium/src/intelligence/constitution.ts))
  may still block based on reversibility.
- **No `az login` from this skill.** Authentication is a
  user-controlled flow. If `authenticated=false`, the skill reports
  it and refuses to proceed.

## Permissions

`process:read` + `process:execute`. Same shape as `task-gcloud`.
