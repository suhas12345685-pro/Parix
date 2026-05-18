export type GenerosityLevel = "minimal" | "balanced" | "generous";

interface GenerosityConfig {
  level: GenerosityLevel;
  proactiveThreshold: number;
  explanationDepth: "brief" | "normal" | "detailed";
  maxProactiveActionsPerHour: number;
}

const CONFIGS: Record<GenerosityLevel, GenerosityConfig> = {
  minimal: {
    level: "minimal",
    proactiveThreshold: 0.95,
    explanationDepth: "brief",
    maxProactiveActionsPerHour: 2,
  },
  balanced: {
    level: "balanced",
    proactiveThreshold: 0.75,
    explanationDepth: "normal",
    maxProactiveActionsPerHour: 10,
  },
  generous: {
    level: "generous",
    proactiveThreshold: 0.55,
    explanationDepth: "detailed",
    maxProactiveActionsPerHour: 30,
  },
};

let currentLevel: GenerosityLevel = "balanced";

export function setGenerosity(level: GenerosityLevel): void {
  currentLevel = level;
}

export function getGenerosity(): GenerosityConfig {
  return CONFIGS[currentLevel];
}

export function shouldActProactively(confidence: number): boolean {
  return confidence >= CONFIGS[currentLevel].proactiveThreshold;
}

export function getExplanationDepth(): "brief" | "normal" | "detailed" {
  return CONFIGS[currentLevel].explanationDepth;
}
