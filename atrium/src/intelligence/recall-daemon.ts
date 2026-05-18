import { getDb } from "../memory/db.js";
import { recall, type Episode } from "./episodes.js";
import { getFacts, upsertFact, type StoredFact } from "../cognition/store.js";
import { decayConfidence } from "./decay.js";

// ── Types ──────────────────────────────────────────────────────────

export interface RecallResult {
  episodeId: number;
  summary: string;
  relevance: number;
  outcome: string;
  keyEntities: string[];
}

export interface Learning {
  id: string;
  domain: string;
  insight: string;
  constraint: string | null;
  approach: string | null;
  outcome: "success" | "failure" | "partial";
  confidence: number;
  tags: string[];
  createdAt: number;
}

export interface PreTaskRecall {
  priorAttempts: RecallResult[];
  relatedDecisions: StoredFact[];
  knownConstraints: Learning[];
  recommendations: string[];
}

export interface ContextualRecall {
  relevantLearnings: Learning[];
  worldFacts: StoredFact[];
  preferences: StoredFact[];
  episodicContext: RecallResult[];
}

// ── Pre-task recall ────────────────────────────────────────────────

export function recallBeforeTask(
  taskDescription: string,
  domain: string,
  entities: string[] = [],
): PreTaskRecall {
  const searchTerms = [taskDescription, domain, ...entities].filter(Boolean);

  const episodes = recall(searchTerms, entities, 5);
  const priorAttempts = episodes.map(scoreEpisodeRelevance(searchTerms));

  const relatedDecisions = getFacts("belief", 20).filter((f) =>
    searchTerms.some(
      (term) =>
        f.key.includes(term) ||
        f.value.toLowerCase().includes(term.toLowerCase()),
    ),
  );

  const knownConstraints = searchLearnings(domain, entities, 10).filter(
    (l) => l.constraint !== null,
  );

  const recommendations = buildRecommendations(
    priorAttempts,
    knownConstraints,
    relatedDecisions,
  );

  logRecallEvent(
    "pre_task",
    taskDescription,
    priorAttempts.length + knownConstraints.length,
  );

  return { priorAttempts, relatedDecisions, knownConstraints, recommendations };
}

// ── Contextual recall (during implementation) ──────────────────────

export function recallDuringTask(
  currentContext: string,
  domain: string,
  entities: string[] = [],
): ContextualRecall {
  const relevantLearnings = searchLearnings(domain, entities, 8);

  const worldFacts = getFacts("world", 15).filter((f) =>
    matchesAny(f.value, [currentContext, domain, ...entities]),
  );

  const preferences = getFacts("preference", 10).filter((f) =>
    matchesAny(f.value, [domain, ...entities]),
  );

  const episodes = recall([currentContext, domain], entities, 3);
  const episodicContext = episodes.map(
    scoreEpisodeRelevance([currentContext, domain]),
  );

  logRecallEvent("contextual", currentContext, relevantLearnings.length);

  return { relevantLearnings, worldFacts, preferences, episodicContext };
}

// ── Post-task persistence ──────────────────────────────────────────

export function saveLearnedInsight(
  learning: Omit<Learning, "id" | "createdAt">,
): string {
  const id = generateId();
  const now = Date.now();

  try {
    getDb().run(
      `INSERT INTO learnings (id, domain, insight, "constraint", approach, outcome, confidence, tags, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        learning.domain,
        learning.insight,
        learning.constraint,
        learning.approach,
        learning.outcome,
        learning.confidence,
        JSON.stringify(learning.tags),
        now,
      ],
    );
  } catch {
    // table may not exist yet
  }

  upsertFact({
    key: `learning:${learning.domain}:${id.slice(0, 8)}`,
    value: learning.insight,
    kind: "belief",
    confidence: learning.confidence,
    evidence: JSON.stringify({
      constraint: learning.constraint,
      approach: learning.approach,
      outcome: learning.outcome,
    }),
  });

  logRecallEvent("save_learning", learning.domain, 1);

  return id;
}

export function saveConstraint(
  domain: string,
  constraint: string,
  discoveredVia: string,
  tags: string[] = [],
): string {
  return saveLearnedInsight({
    domain,
    insight: constraint,
    constraint,
    approach: null,
    outcome: "failure",
    confidence: 0.85,
    tags: ["constraint", ...tags],
  });
}

export function saveApproach(
  domain: string,
  approach: string,
  outcome: "success" | "failure" | "partial",
  insight: string,
  tags: string[] = [],
): string {
  return saveLearnedInsight({
    domain,
    insight,
    constraint: null,
    approach,
    outcome,
    confidence: outcome === "success" ? 0.8 : 0.5,
    tags: ["approach", ...tags],
  });
}

// ── Search learnings ───────────────────────────────────────────────

export function searchLearnings(
  domain: string,
  entities: string[] = [],
  limit = 10,
): Learning[] {
  const results: Learning[] = [];

  try {
    const conditions: string[] = ["domain LIKE ?"];
    const params: (string | number)[] = [`%${domain}%`];

    for (const entity of entities.slice(0, 5)) {
      conditions.push("(insight LIKE ? OR tags LIKE ?)");
      params.push(`%${entity}%`, `%${entity}%`);
    }

    const sql = `
      SELECT id, domain, insight, "constraint", approach, outcome, confidence, tags, created_at
      FROM learnings
      WHERE ${conditions.join(" OR ")}
      ORDER BY confidence DESC, created_at DESC
      LIMIT ?
    `;
    params.push(limit);

    const stmt = getDb().prepare(sql);
    stmt.bind(params);

    while (stmt.step()) {
      const [
        id,
        dom,
        insight,
        constraint,
        approach,
        outcome,
        confidence,
        tags,
        createdAt,
      ] = stmt.get();
      const ageMs = Date.now() - Number(createdAt);
      const decayedConfidence = decayConfidence(Number(confidence), ageMs);

      results.push({
        id: String(id),
        domain: String(dom),
        insight: String(insight),
        constraint: constraint ? String(constraint) : null,
        approach: approach ? String(approach) : null,
        outcome: String(outcome) as Learning["outcome"],
        confidence: decayedConfidence,
        tags: safeParse(String(tags)) ?? [],
        createdAt: Number(createdAt),
      });
    }
    stmt.free();
  } catch {
    // table may not exist
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

// ── Bulk recall (legacy compat) ────────────────────────────────────

export function triggerRecall(context: string, limit = 3): RecallResult[] {
  const episodes = recall([context], [], limit);

  for (const _ of episodes) {
    logRecallEvent("trigger", context, 1);
  }

  return episodes.map(scoreEpisodeRelevance([context]));
}

export function getRecallFrequency(episodeId: number): number {
  try {
    const stmt = getDb().prepare(
      "SELECT COUNT(*) FROM recall_log WHERE episode_id = ?",
    );
    stmt.bind([episodeId]);
    if (stmt.step()) {
      const count = Number(stmt.get()[0]);
      stmt.free();
      return count;
    }
    stmt.free();
  } catch {
    // table may not exist
  }
  return 0;
}

// ── Recall stats ───────────────────────────────────────────────────

export function getRecallStats(): {
  totalRecalls: number;
  totalLearnings: number;
  topDomains: Array<{ domain: string; count: number }>;
} {
  let totalRecalls = 0;
  let totalLearnings = 0;
  const topDomains: Array<{ domain: string; count: number }> = [];

  try {
    const recallStmt = getDb().prepare("SELECT COUNT(*) FROM recall_log");
    recallStmt.step();
    totalRecalls = Number(recallStmt.get()[0]);
    recallStmt.free();
  } catch {}

  try {
    const learnStmt = getDb().prepare("SELECT COUNT(*) FROM learnings");
    learnStmt.step();
    totalLearnings = Number(learnStmt.get()[0]);
    learnStmt.free();
  } catch {}

  try {
    const domainStmt = getDb().prepare(
      "SELECT domain, COUNT(*) as cnt FROM learnings GROUP BY domain ORDER BY cnt DESC LIMIT 5",
    );
    while (domainStmt.step()) {
      const [domain, count] = domainStmt.get();
      topDomains.push({ domain: String(domain), count: Number(count) });
    }
    domainStmt.free();
  } catch {}

  return { totalRecalls, totalLearnings, topDomains };
}

// ── Helpers ────────────────────────────────────────────────────────

function scoreEpisodeRelevance(searchTerms: string[]) {
  return (ep: Episode): RecallResult => {
    const text =
      `${ep.summary} ${ep.keyEntities.join(" ")} ${ep.outcome}`.toLowerCase();
    let hits = 0;
    for (const term of searchTerms) {
      if (text.includes(term.toLowerCase())) hits++;
    }
    const relevance = searchTerms.length > 0 ? hits / searchTerms.length : 0.5;

    return {
      episodeId: ep.id,
      summary: ep.summary,
      relevance: Math.min(1, relevance),
      outcome: ep.outcome,
      keyEntities: ep.keyEntities,
    };
  };
}

function buildRecommendations(
  priorAttempts: RecallResult[],
  constraints: Learning[],
  decisions: StoredFact[],
): string[] {
  const recs: string[] = [];

  const failedAttempts = priorAttempts.filter(
    (a) => a.outcome === "failure" || a.outcome === "timeout",
  );
  if (failedAttempts.length > 0) {
    recs.push(
      `Prior failures detected (${failedAttempts.length}). Review before retrying similar approaches.`,
    );
  }

  for (const c of constraints.slice(0, 3)) {
    recs.push(`Known constraint: ${c.constraint}`);
  }

  const highConfDecisions = decisions.filter((d) => d.confidence > 0.7);
  for (const d of highConfDecisions.slice(0, 2)) {
    recs.push(`Previous decision: ${d.value}`);
  }

  return recs;
}

function matchesAny(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some((t) => t && lower.includes(t.toLowerCase()));
}

function logRecallEvent(
  type: string,
  context: string,
  resultCount: number,
): void {
  try {
    getDb().run(
      "INSERT INTO recall_log (episode_id, ts, user_action) VALUES (?, ?, ?)",
      [0, Date.now(), `${type}:${context.slice(0, 100)}:${resultCount}`],
    );
  } catch {
    // table may not exist
  }
}

function generateId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}`;
}

function safeParse(json: string): any {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
