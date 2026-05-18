export type SkillRuntime = "py" | "node" | "sh";

export type SkillFieldType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "path"
  | "url";

export type SkillPermission =
  | "accessibility:read"
  | "browser:headless"
  | "clipboard:read"
  | "docker:write"
  | "filesystem:read"
  | "filesystem:write"
  | "network:read"
  | "network:write"
  | "notification:send"
  | "process:execute"
  | "process:read"
  | "virtual-desktop:write";

export interface SkillTrigger {
  eventType: string;
  keywords?: string[];
  dataKeys?: string[];
  minConfidence?: number;
  platforms?: Array<"windows" | "macos" | "linux" | "any">;
}

export interface SkillField {
  name: string;
  type: SkillFieldType;
  required?: boolean;
  description?: string;
  default?: unknown;
}

export interface SkillManifest {
  id: string;
  version: string;
  enabled: boolean;
  description?: string;
  triggers: SkillTrigger[];
  entry: string;
  runtime: SkillRuntime;
  inputs: SkillField[];
  outputs: SkillField[];
  reversibility: number;
  permissions: SkillPermission[];
  timeoutMs?: number;
  settings?: Record<string, unknown>;
}
