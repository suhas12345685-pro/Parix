/**
 * Nexus — The Beyonder Self-Improvement Layer
 *
 * Barrel export for the evolutionary architecture:
 * - Spawner: manifest ephemeral specialist workers
 * - Optimizer: recursive self-improvement via cognition metrics
 * - Benchmark: guardrail that prevents regression
 */

// Specialist Spawner — "Manifesting the Avengers"
export {
  spawnSpecialist,
  manifestSpecialist,
  getActiveSpecialists,
  terminateSpecialist,
  terminateAll,
  getSpecialistCapabilities,
} from './spawner.js';

// Recursive Optimizer — Self-Improvement Engine
export {
  recordMetric,
  findDecliningPatterns,
  draftEvolution,
  runOptimizerCycle,
  hashPrompt,
} from './optimizer.js';

// Benchmark Guard — The Beyonder Guardrail
export {
  loadBenchmarkSuite,
  registerBenchmark,
  runBenchmarkSuite,
  seedDefaultBenchmarks,
} from './benchmark.js';

// Types
export type {
  SpecialistType,
  ManifestSpecialistRequest,
  SpawnRequest,
  SpawnResult,
  ActiveSpecialist,
  CognitionMetric,
  PatternPerformance,
  EvolutionPatch,
  EvolutionDraft,
  BenchmarkTask,
  BenchmarkResult,
  BenchmarkSuiteResult,
} from './types.js';
