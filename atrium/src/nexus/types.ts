/**
 * Nexus Types — Shared types for the Beyonder evolutionary architecture.
 *
 * The Nexus is Parix's self-improvement layer:
 * - Spawner: creates ephemeral specialist workers for heavy tasks
 * - Optimizer: monitors cognition metrics and drafts evolution patches
 * - Benchmark: guards against regressions from self-modifications
 */

// ─── Specialist Spawner ────────────────────────────────────────

export type SpecialistType =
  | 'scout'       // Scrapes, discovers, finds contact info
  | 'coder'       // Runs installs, tests, fixes types
  | 'researcher'  // Reads repos/docs, generates reports
  | 'analyst'     // Analyzes data, generates insights
  | 'fixer';      // Diagnoses and repairs specific issues

export interface SpawnRequest {
  type: SpecialistType;
  goal: string;
  payload: Record<string, unknown>;
  timeoutMs?: number;      // Default: 120_000 (2 minutes)
  permissions: 'SANDBOX_ONLY' | 'READ_ONLY' | 'FULL';
}

export interface ManifestSpecialistRequest {
  type: SpecialistType;
  goal: string;
  payload?: Record<string, unknown>;
  timeoutMs?: number;
  permissions?: 'SANDBOX_ONLY' | 'READ_ONLY';
  expectedOutput?: string;
}

export interface SpawnResult {
  specialistType: SpecialistType;
  goal: string;
  success: boolean;
  output: unknown;
  error?: string;
  executionTimeMs: number;
  tokensUsed?: number;
}

export interface ActiveSpecialist {
  id: string;
  type: SpecialistType;
  goal: string;
  startedAt: number;
  timeoutMs: number;
}

// ─── Cognition Metrics ─────────────────────────────────────────

export interface CognitionMetric {
  id?: number;
  promptHash: string;
  executionTimeMs: number;
  successScore: number;     // 0.0 to 1.0
  tokensUsed: number;
  patternType?: string;
  contextSummary?: string;
  timestamp?: string;
}

export interface PatternPerformance {
  promptHash: string;
  patternType: string;
  avgSuccessScore: number;
  avgExecutionTimeMs: number;
  totalTokensUsed: number;
  sampleCount: number;
  lastSeen: string;
}

// ─── Evolution System ──────────────────────────────────────────

export interface EvolutionPatch {
  id: string;
  promptHash: string;
  oldPromptSummary: string;
  newPromptSummary: string;
  improvementDelta: number;  // Expected improvement (-1.0 to 1.0)
  benchmarkPass: boolean;
  applied: boolean;
  draftPath: string;
  createdAt: string;
}

export interface EvolutionDraft {
  patchId: string;
  targetPattern: string;
  currentPerformance: PatternPerformance;
  analysis: string;
  proposedChange: string;
  expectedImprovement: number;
  draftPath: string;
}

// ─── Benchmark System ──────────────────────────────────────────

export interface BenchmarkTask {
  id: string;
  taskName: string;
  inputJson: string;
  expectedOutputJson: string;
  weight: number;           // Relative importance (0.0 to 1.0)
  lastRunAt?: string;
  lastPass?: boolean;
}

export interface BenchmarkResult {
  taskId: string;
  taskName: string;
  passed: boolean;
  actualOutput?: string;
  expectedOutput: string;
  similarity: number;       // 0.0 to 1.0 — how close to expected
  executionTimeMs: number;
}

export interface BenchmarkSuiteResult {
  totalTasks: number;
  passed: number;
  failed: number;
  failedTasks: BenchmarkResult[];
  overallScore: number;     // Weighted average similarity
  verdict: 'PASS' | 'FAIL'; // FAIL if >1 benchmark broken
}
