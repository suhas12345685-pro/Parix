import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const ENV_VAR = "PARIX_SYNAPSE_TOKEN";
const TOKEN_FILENAME = "synapse-token";

export function tokenPath(): string {
  return join(homedir(), ".parix", TOKEN_FILENAME);
}

export function loadSynapseToken(): string | null {
  const env = (process.env[ENV_VAR] ?? "").trim();
  if (env) return env;

  try {
    const text = readFileSync(tokenPath(), "utf8").trim();
    return text || null;
  } catch {
    return null;
  }
}
