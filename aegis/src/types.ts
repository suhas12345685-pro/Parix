/** Shared types for the Aegis dashboard */

export type AtriumState =
  | "IDLE"
  | "OBSERVING"
  | "THINKING"
  | "ACTING"
  | "WAITING"
  | "ERROR";

export interface DashboardState {
  atriumState: AtriumState;
  paused: boolean;
  pausedAt: number | null;
  handsStatus: string;
  queueDepth: number;
  uptime: number;
  lastUpdate: number;
}

export interface SensorEvent {
  id: string;
  eventType: string;
  data: Record<string, unknown>;
  confidence: number;
  timestamp: number;
}

export interface AuditEntry {
  id: number;
  actor: string;
  action: string;
  taskId: string | null;
  payload: Record<string, unknown> | null;
  prevHash: string;
  thisHash: string;
  ts: string;
}

export interface SkillStats {
  totalPatterns: number;
  hitRate: number;
}

export interface DlqStats {
  pending: number;
  exhausted: number;
}

export interface GovernorStats {
  minuteCount: number;
  hourCount: number;
  dailyTokens: number;
  dailyLimit: number;
}

export interface CanvasState {
  title: string;
  content: string;
  format: "markdown" | "text";
  updatedAt: number;
}

export interface SystemHealth {
  dashboard: DashboardState;
  skills: SkillStats;
  dlq: DlqStats;
  governor: GovernorStats;
  cognition: CognitionSnapshot;
  channels: ChannelSnapshot[];
  cronTasks: CronTask[];
  installedSkills: InstalledSkill[];
  workspaceFiles: WorkspaceFile[];
  recentEvents: SensorEvent[];
  recentAudit: AuditEntry[];
  canvas?: CanvasState | null;
}

export interface CognitionSnapshot {
  attention: {
    focus: string | null;
    strength: number;
    admitRate: number;
    suppressedCount: number;
  };
  metacognition: {
    cognitiveLoad: number;
    strategy?: string;
    reason?: string;
  };
  activePlan: GoalTreeSnapshot | null;
  activeNarratives: NarrativeSnapshot[];
  accessibility?: AccessibilitySnapshot | null;
}

export interface AccessibilitySnapshot {
  focusedApp: string;
  backendUsed: string;
  confidence: number;
  ts: number;
  focusedElement: {
    role: string;
    name: string;
    state: string[];
  } | null;
}

export interface GoalTreeSnapshot {
  id: string;
  rootGoal: string;
  status: string;
  progress: {
    total: number;
    done: number;
    failed: number;
    active: number;
    skipped: number;
    percent: number;
  };
  nodes: PlanNodeSnapshot[];
}

export interface PlanNodeSnapshot {
  id: string;
  goal: string;
  status: string;
  retries: number;
  maxRetries: number;
}

export interface NarrativeSnapshot {
  id: string;
  goal: string;
  summary: string;
  status: string;
  attemptCount: number;
  failureStreak: number;
  lastActivityAt: number;
  attempts: Array<{
    approach: string;
    outcome: string;
    timestamp: number;
    lessonLearned?: string;
  }>;
}

export interface ChannelSnapshot {
  id: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface CronTask {
  taskId: string;
  title: string;
  prompt: string;
  intervalMinutes: number;
  cronExpression?: string;
  enabled: boolean;
  source: string;
}

export interface InstalledSkill {
  id: string;
  path: string;
  description?: string;
  hasScripts: boolean;
  hasReferences: boolean;
  hasTemplates: boolean;
  source?: string;
  updatedAt?: number;
}

export interface WorkspaceFile {
  path: string;
  exists: boolean;
}

export interface WsMessage {
  type: string;
  [key: string]: unknown;
}
