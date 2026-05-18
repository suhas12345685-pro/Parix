# Security audit — v0.2 pre-launch pass

Auditor: Claude. Date: 2026-05-18. Scope: `hands/executor/`, autonomy
gates, approval policy enforcement, skill permission boundaries, synapse
exposure surface. Reviewed against the **public launch** threat model
(adversary = malicious LLM output that tries to escalate beyond what
the user authorized).

This audit is not exhaustive. It is a pre-launch sweep focused on what
breaks if someone external pokes at the agent-control surface.

---

## Summary

| # | Severity | Title | Status |
|---|---|---|---|
| 1 | **HIGH** | Self-approval bypass via payload field | **FIXED** in this audit |
| 2 | **HIGH** | Skill permission gate is a no-op (manifest self-approves) | **FIXED** after audit |
| 3 | MEDIUM | `full-auto` autonomy has no Constitution floor | **FIXED** after audit |
| 4 | MEDIUM | Enterprise `forbiddenScope` only matches `cli` task type | **FIXED** after audit |
| 5 | LOW | Approval term matching scans `JSON.stringify(payload)` (false-positive prone + evasion via encoding) | Documented |
| 6 | LOW | Synapse WebSocket binds to `localhost` by default but `PARIX_WS_HOST` is unauthenticated | Documented |
| 7 | LOW | `cli.execute` accepts arbitrary `cwd` from payload | Documented |

---

## Finding 1 — Self-approval bypass via payload field (HIGH)

**Where:** [atrium/src/config/profile.ts:298](../atrium/src/config/profile.ts)

```ts
function hasHumanApproval(payload: Record<string, unknown>): boolean {
  return payload.approved === true || payload.humanApproved === true;
}
```

**Why it's exploitable:** the payload comes from the cognition layer.
The cognition layer's plan content is materially shaped by LLM output.
An LLM that proposes a payload containing `approved: true` short-
circuits the entire approval-required rule chain — including
"delete data without approval," "send external messages without
approval," "spend money without approval" (see
[hatchery-schema.ts:699-704](../shared/hatchery-schema.ts)).

The attack does not require prompt injection from an external source;
it only requires the LLM to "decide" the action is fine.

**Confirmation it isn't real-world used:** grepping the repo finds
**zero** call sites that legitimately set `payload.approved = true` as
a human-approval signal. The only writer of an `approved` field is
[cognition/critic.ts:31](../atrium/src/cognition/critic.ts) which uses
it for an internal critic vote, but that result does not flow into the
constitution payload. The check is dead code that exists only as a
bypass surface.

**Fix applied in this audit:** the `hasHumanApproval` check is removed.
Approval-required actions now always trigger the rule, regardless of
payload content. When real human-approval UX lands (Aegis approval
modal → signed token), the gate should be re-introduced as a separate
*runtime context parameter*, not a payload field — so LLM-constructed
content can never satisfy it.

**Follow-up:** when implementing approval UX, the contract should be:

```ts
constitution.checkRule(taskType, payload, ctx, {
  humanApproval: { token: "...", grantedAt: 1234, byUser: "..." },
});
```

Approval state belongs in `ctx`, not `payload`. Payload is data the
agent proposes; context is data the runtime knows.

---

## Finding 2 — Skill permission gate is a no-op (HIGH)

**Where:** [atrium/src/intelligence/council.ts:1124](../atrium/src/intelligence/council.ts)

```ts
const skillResult = await runSkill({
  skillDir: reg.skillDir,
  manifest: reg.manifest,
  inputs: augmentedInputs,
  permittedPermissions: new Set(reg.manifest.permissions),
});
```

The `permittedPermissions` parameter is intended to be the **caller's
clearance set** that the manifest must be a subset of. As wired, it
*is* the manifest's permissions, so every skill is automatically a
subset of itself — the check at
[skill-runner.ts:61-66](../atrium/src/intelligence/skill-runner.ts)
can never reject anything.

**Why this is HIGH despite no exploit today:** as long as every skill
shipped with Parix is first-party, the manifest-self-disclosure model
is "trust on first install." The hole opens the moment Parix accepts
third-party skills — a malicious manifest can declare
`permissions: ["shell", "filesystem-write", "network"]` and the gate
will silently grant all three.

**Original audit note:** the proper fix requires user-
granted permission state in the profile (e.g.
`profile.skillPermissions: { [skillId]: SkillPermission[] }`) plus a
UX prompt at skill install. The schema doesn't have that field yet and
adding it without the prompt would either deny every skill or default-
allow every skill — both wrong. Track it as the **hard prerequisite
for opening a third-party skill registry**.

**Original interim mitigation:** the in-tree skill registry must remain
first-party-only until the gate is real. Add a doc note to
`docs/cognition.md` and a CI check that refuses external skill
manifests.

**Post-audit update:** `council.ts` now passes a runtime grant set from
`skill-permissions.ts`, not the manifest's own permission list. Known
first-party skills receive explicit per-skill permissions; unknown
skills receive an empty grant set and cannot self-approve filesystem,
network, process, clipboard, or browser powers. A real marketplace still
needs profile-backed permission grants plus an install-time prompt.

---

## Finding 3 — `full-auto` autonomy has no Constitution floor (MEDIUM)

**Where:** [atrium/src/config/profile.ts:288](../atrium/src/config/profile.ts)

```ts
// 'safe-auto-fix' and 'safe-auto' use default Constitution rules
// 'full-auto' and 'policy-based' also use defaults (advanced modes for power users)
```

`full-auto` is reachable from the personal-mode hatchery TUI as one of
three autonomy choices. It does not add any reversibility floor on top
of the default Constitution rules.

**Why this is MEDIUM not HIGH:** the default Constitution rules
(reversibility scoring, governor budgets, forbiddenScope) are still
active. So `full-auto` is not "no rules," it's "no extra floor on top
of the defaults." The risk is that a user picks `full-auto` thinking
"the agent is more aggressive" without realizing it removes the only
remaining barrier to chain-executing irreversible actions.

**Fix applied after audit:** autonomy is now evaluated through
`autonomy-policy.ts`. `full-auto` and enterprise `policy-based` keep a
hard reversibility floor and require very high confidence for low-
reversibility actions. Hatchery also labels `full-auto` as maximum
autonomy with hard safety floors instead of implying rule-free execution.

---

## Finding 4 — Enterprise `forbiddenScope` is `cli`-only (MEDIUM)

**Where:** [atrium/src/config/profile.ts:188-198](../atrium/src/config/profile.ts)

```ts
constitution.addRule((taskType, payload, _ctx) => {
  if (taskType !== "cli") return null;
  ...
});
```

Enterprise `forbiddenScope` items are matched **only** against `cli`
task types. A skill, browser action, or channel message containing the
same forbidden term passes the rule unchallenged.

**Fix applied after audit:** the `taskType !== "cli"` gate was removed.
Enterprise `forbiddenScope` now checks the same normalized
`payloadText(taskType, payload)` surface used by the profile policy
rules, so skills, notifications, and future browser actions cannot
route around enterprise scope terms.

---

## Finding 5 — Substring approval matching is brittle (LOW)

**Where:** [atrium/src/config/profile.ts:302-350](../atrium/src/config/profile.ts)

`matchesPolicyTerm` scans `JSON.stringify(payload)` for substrings and
regex hits. Two consequences:

- **False positives.** A payload `{ message: "I will not delete files" }`
  matches the `\bdelete\b` regex and triggers an approval prompt for a
  task that wasn't going to delete anything. Long-term this drives
  approval fatigue → users blanket-approve.
- **Evasion.** An LLM that wants to avoid the matcher can base64 the
  command, hex-encode it, split it across fields, or use Unicode
  homoglyphs. Substring matching catches the honest 99%, not the
  adversarial 1%.

**Recommended fix:** for v1.0 this is acceptable — the rules are
defense-in-depth, not the primary gate. The primary gate should be
the reversibility/autonomy floor (which doesn't care about content).
For v1.x, replace `matchesPolicyTerm` with a typed allowlist per task
type, e.g. `taskType: "cli"` checks the actual argv tokens against a
real shell parser, not a JSON haystack.

---

## Finding 6 — Synapse WebSocket has no auth, `PARIX_WS_HOST` env is unguarded (LOW)

**Where:** [hands/main.py:51](../hands/main.py)

```python
HOST = os.getenv("PARIX_WS_HOST", "localhost")
PORT = int(os.getenv("PARIX_WS_PORT", str(SYNAPSE_PORT)))
...
async with websockets.serve(connection_handler, HOST, PORT):
```

The default binds to localhost, which is fine. But any environment
that sets `PARIX_WS_HOST=0.0.0.0` (e.g. a docker run with bad
defaults, a misconfigured systemd unit) exposes the synapse socket to
the LAN. The socket itself has **no authentication** — any client that
connects can register as `atrium` by sending an `ATRIUM_MESSAGE_TYPES`
message first, and from then on dictates which task requests the hands
process executes.

**Recommended fix (not applied):** before public launch, either

1. refuse non-localhost binds unless `PARIX_ALLOW_REMOTE_SYNAPSE=1` is
   *also* set (defense in depth — single env var foot-gun is too easy);
2. require a shared secret on the first message from atrium (load from
   `~/.parix/synapse-token`, regenerated per install), and reject
   connections that don't present it.

(2) is the right answer long-term. (1) is the right answer for the
launch window.

---

## Finding 7 — `cli.execute` accepts arbitrary `cwd` (LOW)

**Where:** [hands/executor/cli.py:66-71](../hands/executor/cli.py)

```python
async def execute(payload: dict[str, Any]) -> dict[str, Any]:
    command = payload.get("argv") or payload.get("command", "")
    argv = parse_command(command)
    timeout = payload.get("timeout", DEFAULT_TIMEOUT)
    cwd = payload.get("cwd")
    return await run_async(argv, timeout=timeout, cwd=cwd)
```

`cwd` is passed straight to `subprocess.run`. An LLM-constructed payload
that sets `cwd: "/etc"` plus a relative-path command can do things the
user didn't ask for. The argv parsing already protects against shell
injection (`shell=False`, `shlex.split`), so this is downstream of an
already-authorized command — but cwd is part of the threat surface.

**Recommended fix (not applied):** validate `cwd` against an allowlist
(user home, current project, explicit user-configured dirs). Same
ticket as finding 5 — content validation belongs in a typed-payload
layer that doesn't currently exist.

---

## Recommendations rolled up for the v1.0 milestone

| Action | Severity | Effort |
|---|---|---|
| (Applied) Remove `hasHumanApproval` payload bypass | HIGH | done |
| (Applied) Replace manifest self-grant with first-party runtime permission allowlist | HIGH | done |
| Add `profile.skillPermissions` + install-time prompt before third-party registry | HIGH | 3–4h + UX |
| Refuse non-localhost synapse bind unless second env var is set | LOW→MEDIUM at launch | 30m |
| Add shared-secret handshake to synapse | LOW | 2h |
| (Applied) Drop `cli`-only gate from enterprise `forbiddenScope` | MEDIUM | done |
| (Applied) Add hard runtime floor for `full-auto` and clarify TUI wording | MEDIUM | done |
| Validate `cli.execute` `cwd` against allowlist | LOW | 1h |

None of these are launch-blockers individually. The combination of
findings 1 + 2 + 6, if all left unfixed, *is* a launch blocker — they
are the three places where a misbehaving LLM or a hostile network can
escalate. Finding 1 is fixed in this audit; findings 2 and 6 should
land before the v1.0 tag.
