---
name: parix-autonomous-discovery
description: Autonomous Context Scanning, Self-Diagnosis, and Proactive Discovery
---

# Parix Skill — Autonomous Discovery & Self-Diagnosis

> Use when Parix is acting autonomously to diagnose the local workstation, scan for systemic anomalies, analyze file states, check network ports, and preemptively resolve issues without requiring explicit user instructions.

## 🧠 Core Goal
Enable the agent to **autonomously figure out everything by itself**. Instead of waiting for a user command or explicit sensor trace, Parix actively harvests environmental context, formulates hypotheses, detects hidden bugs/misconfigurations, and designs self-healing corrections.

```text
Active Scan ──> Harvester ──> Anomalies Detected? ──> Yes ──> Formulate Hypothesis ──> Prepare Draft ──> Notify/Fix
                                  │
                                  └──> No ──> Sleep & Monitor (Shadow Mode)
```

---

## 🛠️ Step-by-Step Discovery Protocol

### Step 1: Context Harvesting & Signal Collection
Parix periodically scans local interfaces, databases, and logs to construct a complete map of the workspace.

* **Process State**: Scan active background tasks, PM2 daemons, and system processes for anomalous exit statuses.
  ```powershell
  # Windows process status check
  Get-Process | Where-Object { $_.Responding -eq $false }
  npx pm2 status
  ```
* **Network Binding & Port Mapping**: Check if critical WebSocket interfaces or database endpoints are bound correctly.
  ```powershell
  # Verify Parix communication channels (8765 / 8766)
  netstat -ano | findstr "8765 8766"
  ```
* **Disk and IO Anomalies**: Check for storage constraints and file integrity.
  ```powershell
  # Storage space diagnostic
  Get-Volume | Select-Object DriveLetter, FileSystem, SizeRemaining, Size
  ```

### Step 2: Multi-Signal Correlation & Anomaly Parsing
Ingest harvested data into the **Attention & Desire inference engine**. Correlate multiple minor anomalies into a unified structural hypothesis.

* **Log Dredging**: Parse recent application, Node.js, and Python standard errors looking for recurring unhandled exceptions.
* **Episodic Correlator**: Match current anomalies against the `episodes` database table to check if this pattern has occurred (and been resolved) previously.

### Step 3: Proactive Hypothesis Generation
If anomalies are found, generate a `desire` payload:
```typescript
{
  inferredGoal: "Self-heal local environment configuration",
  userNeed: "Workspace is in a degraded state due to a missing/mismatched dependency or port collision",
  evidence: ["Port 8765 occupied by PID 4120", "PM2 parix-hands service is in 'errored' state"],
  confidence: 0.95,
  suggestedHelp: ["parix-autonomous-discovery:terminate-port-collision"],
  silentPrep: ["taskkill /F /PID 4120", "npx pm2 start parix-hands"],
  interrupt: true
}
```

### Step 4: Silent Preparation & Drafting
* **Zero-Interruption Design**: Construct a solution draft (e.g. an auto-generated dependency installer or Git-recovery branch) inside the local cache.
* **Safety Evaluation**: Run the proposed action through the **Constitution Guardrails** and **Reversibility Scoring Matrix** to ensure the fix is safe to propose or execute.

### Step 5: Proactive Action & Notification
Deliver a polished notification to the active channels (Telegram/Aegis/Console):
```text
🔍 Parix Auto-Diagnosis: I noticed port 8765 had a collision which caused the hands daemon to crash.
🛠️ Proposed Fix: I've prepared a command to clear the stale process and reboot the synapse daemon.
👉 Press [Apply Fix] to proceed.
```

---

## 🔍 Diagnostic Commands & Tools

| Command | Objective | Skill Mapping |
|---------|-----------|---------------|
| `python hands/sensors/watcher.py` | Standalone CLI watcher check | `parix-sensors` |
| `npx pm2 logs --lines 100` | Pull recent daemon logs | `parix-troubleshooting` |
| `git status --porcelain` | Find unstaged/dirty changes | `task-git-recovery` |
| `pip check` | Verify Python package requirements | `task-dev-env` |

---

## 💡 Best Practices for Autonomous Mode
1. **Never Interrupted without Confidence**: Keep the interruption threshold high unless the system state is critical (e.g. infinite loop, crash, out of memory).
2. **Always Logs to SQLite**: Every discovery iteration and diagnostic output must be logged in `data/memory.db` for complete auditability.
3. **Graceful Degradation**: If an autonomous command fails, fall back silently, record the event, increment the confidence decay, and do not repeat the attempt for at least 300 seconds.
