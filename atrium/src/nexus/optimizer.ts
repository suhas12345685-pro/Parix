/**
 * Recursive Optimizer — The Beyonder's Self-Improvement Engine
 *
 * Monitors cognition_metrics for patterns with declining success.
 * When a pattern's average success_score falls below 0.7, triggers
 * analysis and drafts a "Cognition Evolution" patch in shadow_drafts/evolution/.
 *
 * Every evolution draft MUST pass the Benchmark Guard before it can
 * be applied. The creator (user) remains the final judge.
 *
 * WARNING: This creates a Recursive Feedback Loop. The Beyonder
 * Guardrail (benchmark.ts) prevents regressions. Without it,
 * the optimizer might rewrite prompts to be so short they become
 * vague and hallucinatory.
 */

import { randomUUID } from 'crypto';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { getDb } from '../memory/db.js';
import { runBenchmarkSuite } from './benchmark.js';
import type {
  CognitionMetric,
  PatternPerformance,
  EvolutionDraft,
} from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../../..');
const EVOLUTION_DIR = join(PROJECT_ROOT, 'shadow_drafts', 'evolution');

// ─── Metrics Recording ────────────────────────────────────────

/**
 * Record a cognition metric for a completed task.
 * Called after every cognitive cycle completes.
 */
export function recordMetric(metric: CognitionMetric): void {
  const db = getDb();
  db.run(
    `INSERT INTO cognition_metrics (prompt_hash, execution_time_ms, success_score, tokens_used, pattern_type, context_summary)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      metric.promptHash,
      metric.executionTimeMs,
      metric.successScore,
      metric.tokensUsed,
      metric.patternType ?? null,
      metric.contextSummary ?? null,
    ]
  );
}

// ─── Pattern Analysis ──────────────────────────────────────────

/**
 * Find all patterns whose average success_score has fallen below
 * the threshold (default 0.7). These are candidates for evolution.
 */
export function findDecliningPatterns(threshold: number = 0.7, minSamples: number = 5): PatternPerformance[] {
  const db = getDb();
  const results: PatternPerformance[] = [];

  const stmt = db.prepare(
    `SELECT
       prompt_hash,
       COALESCE(pattern_type, 'unknown') as pattern_type,
       AVG(success_score) as avg_score,
       AVG(execution_time_ms) as avg_time,
       SUM(tokens_used) as total_tokens,
       COUNT(*) as sample_count,
       MAX(timestamp) as last_seen
     FROM cognition_metrics
     GROUP BY prompt_hash
     HAVING COUNT(*) >= ? AND AVG(success_score) < ?
     ORDER BY avg_score ASC`
  );
  stmt.bind([minSamples, threshold]);

  while (stmt.step()) {
    const cols = stmt.getColumnNames();
    const vals = stmt.get();
    const row: Record<string, unknown> = {};
    cols.forEach((c: string, i: number) => (row[c] = vals[i]));

    results.push({
      promptHash: String(row.prompt_hash),
      patternType: String(row.pattern_type),
      avgSuccessScore: Number(row.avg_score),
      avgExecutionTimeMs: Number(row.avg_time),
      totalTokensUsed: Number(row.total_tokens),
      sampleCount: Number(row.sample_count),
      lastSeen: String(row.last_seen),
    });
  }
  stmt.free();
  return results;
}

// ─── Evolution Drafting ────────────────────────────────────────

/**
 * Draft an evolution patch for a declining pattern.
 * Writes the draft to shadow_drafts/evolution/ and records it
 * in the evolution_ledger with applied=0.
 *
 * The draft contains:
 * - Current performance metrics
 * - Analysis of why the pattern is failing
 * - Proposed change to the system prompt/logic
 * - Expected improvement estimate
 */
export function draftEvolution(pattern: PatternPerformance): EvolutionDraft {
  mkdirSync(EVOLUTION_DIR, { recursive: true });

  const patchId = randomUUID();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const draftFilename = `${timestamp}-${pattern.patternType}-${patchId.slice(0, 8)}.md`;
  const draftPath = join(EVOLUTION_DIR, draftFilename);

  const analysis = analyzeFailurePattern(pattern);
  const proposedChange = generateEvolutionProposal(pattern, analysis);

  const draftContent = `# Cognition Evolution Draft

## Patch ID: \`${patchId}\`
## Generated: ${new Date().toISOString()}

---

## Target Pattern
- **Hash**: \`${pattern.promptHash}\`
- **Type**: ${pattern.patternType}
- **Avg Success Score**: ${(pattern.avgSuccessScore * 100).toFixed(1)}%
- **Avg Execution Time**: ${pattern.avgExecutionTimeMs.toFixed(0)}ms
- **Total Tokens Used**: ${pattern.totalTokensUsed}
- **Sample Count**: ${pattern.sampleCount}
- **Last Seen**: ${pattern.lastSeen}

## Analysis

${analysis}

## Proposed Change

${proposedChange}

## Expected Improvement

- **Success Score**: ${pattern.avgSuccessScore.toFixed(2)} → ${Math.min(1.0, pattern.avgSuccessScore + 0.15).toFixed(2)} (estimated)
- **Improvement Delta**: +${(0.15 * 100).toFixed(0)}% (conservative estimate)

## Benchmark Status

⏳ Pending — this draft must pass the Benchmark Suite before it can be applied.

## Safety Notes

> ⚠️ **BEYONDER GUARDRAIL**: This evolution draft will be compared against
> the Benchmark Suite of critical tasks. If it breaks a benchmark, it will
> be automatically deleted. The creator remains the final judge.
`;

  writeFileSync(draftPath, draftContent, 'utf-8');

  // Record in evolution ledger
  const db = getDb();
  db.run(
    `INSERT INTO evolution_ledger (id, prompt_hash, old_prompt_summary, new_prompt_summary, improvement_delta, benchmark_pass, applied, draft_path)
     VALUES (?, ?, ?, ?, ?, 0, 0, ?)`,
    [
      patchId,
      pattern.promptHash,
      `Pattern ${pattern.patternType} with avg score ${pattern.avgSuccessScore.toFixed(2)}`,
      proposedChange.slice(0, 500),
      0.15,
      draftPath,
    ]
  );

  console.log(`[NEXUS] Evolution draft created: ${draftFilename}`);

  return {
    patchId,
    targetPattern: pattern.promptHash,
    currentPerformance: pattern,
    analysis,
    proposedChange,
    expectedImprovement: 0.15,
    draftPath,
  };
}

/**
 * Run the full optimizer cycle:
 * 1. Find declining patterns
 * 2. Draft evolutions for each
 * 3. Run benchmark guard on each draft
 * 4. Mark passing drafts as benchmark_pass=1
 * 5. Delete failing drafts
 *
 * Returns the number of passing evolutions.
 */
export async function runOptimizerCycle(): Promise<{
  patternsFound: number;
  draftsCreated: number;
  benchmarkPassed: number;
  benchmarkFailed: number;
}> {
  const patterns = findDecliningPatterns();

  if (patterns.length === 0) {
    console.log('[NEXUS] Optimizer: no declining patterns found. System is healthy.');
    return { patternsFound: 0, draftsCreated: 0, benchmarkPassed: 0, benchmarkFailed: 0 };
  }

  console.log(`[NEXUS] Optimizer: found ${patterns.length} declining pattern(s). Drafting evolutions...`);

  let passed = 0;
  let failed = 0;
  const drafts: EvolutionDraft[] = [];

  for (const pattern of patterns) {
    const draft = draftEvolution(pattern);
    drafts.push(draft);

    // Run benchmark guard
    const benchmarkResult = await runBenchmarkSuite(draft.patchId);

    if (benchmarkResult.verdict === 'PASS') {
      // Mark as benchmark-passing in the ledger
      const db = getDb();
      db.run(
        'UPDATE evolution_ledger SET benchmark_pass = 1 WHERE id = ?',
        [draft.patchId]
      );
      console.log(`[NEXUS] ✓ Evolution ${draft.patchId.slice(0, 8)} PASSED benchmarks (${benchmarkResult.overallScore.toFixed(2)} score)`);
      passed++;
    } else {
      // Delete the failing draft
      const { unlinkSync } = await import('fs');
      if (existsSync(draft.draftPath)) {
        unlinkSync(draft.draftPath);
      }
      const db = getDb();
      db.run('DELETE FROM evolution_ledger WHERE id = ?', [draft.patchId]);
      console.log(
        `[NEXUS] ✗ Evolution ${draft.patchId.slice(0, 8)} FAILED benchmarks — deleted. ` +
        `Failed tasks: ${benchmarkResult.failedTasks.map(t => t.taskName).join(', ')}`
      );
      failed++;
    }
  }

  return {
    patternsFound: patterns.length,
    draftsCreated: drafts.length,
    benchmarkPassed: passed,
    benchmarkFailed: failed,
  };
}

// ─── Internals ─────────────────────────────────────────────────

function analyzeFailurePattern(pattern: PatternPerformance): string {
  const issues: string[] = [];

  if (pattern.avgSuccessScore < 0.3) {
    issues.push('**Critical**: Pattern is failing more than 70% of the time. The core approach may be fundamentally wrong.');
  } else if (pattern.avgSuccessScore < 0.5) {
    issues.push('**Severe**: Pattern succeeds less than half the time. Likely a mismatch between expected and actual behavior.');
  } else {
    issues.push('**Moderate**: Pattern is below the 0.7 threshold but not critically failing. May need prompt refinement or context improvement.');
  }

  if (pattern.avgExecutionTimeMs > 10000) {
    issues.push('**Slow execution**: Average time exceeds 10 seconds. Consider simplifying the approach or caching intermediate results.');
  }

  if (pattern.totalTokensUsed > 100000) {
    issues.push('**High token usage**: Pattern has consumed significant tokens. Consider more efficient prompting or local processing.');
  }

  if (pattern.sampleCount > 20) {
    issues.push('**Large sample size**: With 20+ observations, this is a persistent issue, not a fluke.');
  }

  return issues.join('\n\n');
}

function generateEvolutionProposal(pattern: PatternPerformance, _analysis: string): string {
  // In a full implementation, this would use the LLM to generate
  // a specific prompt improvement. For now, generate a structured template.
  return `### Recommended Evolution for \`${pattern.patternType}\`

1. **Add context anchoring**: Include the most recent successful example in the prompt to ground the model.
2. **Narrow the output format**: Constrain the expected output format to reduce hallucination surface.
3. **Add failure-mode check**: Before executing, verify the preconditions that caused past failures.
4. **Increase confidence threshold**: Raise the minimum confidence for autonomous action on this pattern from 0.7 to 0.85.

### Prompt Template Diff

\`\`\`diff
- You are handling a ${pattern.patternType} task. Analyze and respond.
+ You are handling a ${pattern.patternType} task.
+ CONTEXT: This pattern has historically succeeded ${(pattern.avgSuccessScore * 100).toFixed(0)}% of the time.
+ CONSTRAINT: If confidence < 0.85, ask for clarification instead of acting.
+ FORMAT: Respond with a JSON object containing { action, confidence, reasoning }.
\`\`\``;
}

/**
 * Hash a prompt string for metric tracking.
 */
export function hashPrompt(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex').slice(0, 16);
}
