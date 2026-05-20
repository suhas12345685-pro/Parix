/**
 * Provider smoke tests for Hatchery/Atrium LLM auth flows.
 *
 * Default mode is credential discovery only:
 *   npm run smoke:providers
 *
 * Live calls require explicit opt-in:
 *   npm run smoke:providers -- --live --auth=api_key
 */

import { spawnSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import {
  DEFAULT_MODELS,
  LLM_PROVIDER_CAPABILITIES,
  LLM_PROVIDERS,
  PROVIDER_ENV_KEYS,
} from "../shared/hatchery-schema.ts";
import {
  AnthropicAdapter,
  BytezAdapter,
  ChatGPTAdapter,
  CopilotAdapter,
  DeepSeekAdapter,
  GrokAdapter,
  GroqAdapter,
  KimiAdapter,
  LMStudioAdapter,
  MistralAdapter,
  OllamaAdapter,
  OpenRouterAdapter,
  PerplexityAdapter,
} from "../atrium/src/llm/adapters/index.ts";
import type { LLMProvider as RuntimeProvider } from "../atrium/src/llm/types.ts";

type AuthFilter = "all" | "api_key" | "account_auth" | "local";
type Status = "pass" | "fail" | "skip";

interface Args {
  live: boolean;
  provider: string | null;
  auth: AuthFilter;
  timeoutMs: number;
}

interface SmokeResult {
  provider: string;
  auth: AuthFilter;
  status: Status;
  detail: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PARIX_HOME = process.env.PARIX_HOME || resolve(homedir(), ".parix");

const API_KEY_ALIASES: Record<string, string[]> = {
  openai: ["OPENAI_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  groq: ["GROQ_API_KEY"],
  grok: ["XAI_API_KEY", "GROK_API_KEY"],
  perplexity: ["PERPLEXITY_API_KEY"],
  mistral: ["MISTRAL_API_KEY"],
  kimi: ["MOONSHOT_API_KEY", "KIMI_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
  bytez: ["BYTEZ_API_KEY"],
  copilot: ["COPILOT_API_KEY", "GITHUB_TOKEN"],
  deepseek: ["DEEPSEEK_API_KEY"],
};

const ACCOUNT_COMMANDS: Record<string, string[][]> = {
  openai: [
    ["codex", "--version"],
    ["openai", "--version"],
  ],
  anthropic: [["claude", "--version"]],
  copilot: [["gh", "auth", "status"]],
};

async function main(): Promise<void> {
  loadEnv(resolve(ROOT, ".env"));
  loadEnv(resolve(PARIX_HOME, ".env"));

  const args = parseArgs(process.argv.slice(2));
  const providers = LLM_PROVIDERS.filter(
    (provider) => !args.provider || provider === args.provider,
  );

  if (providers.length === 0) {
    console.error(`Unknown provider: ${args.provider}`);
    process.exit(1);
  }

  const results: SmokeResult[] = [];
  for (const provider of providers) {
    if (args.auth === "all" || args.auth === "api_key") {
      results.push(await smokeApiKey(provider, args));
    }
    if (args.auth === "all" || args.auth === "account_auth") {
      results.push(smokeAccountAuth(provider));
    }
    if (args.auth === "all" || args.auth === "local") {
      results.push(await smokeLocal(provider, args));
    }
  }

  printResults(results, args.live);
  if (results.some((result) => result.status === "fail")) process.exit(1);
}

async function smokeApiKey(
  provider: string,
  args: Args,
): Promise<SmokeResult> {
  const capability = LLM_PROVIDER_CAPABILITIES[provider];
  if (!capability?.supportedAuthMethods.includes("api_key")) {
    return skip(provider, "api_key", "provider does not use API-key auth");
  }

  const found = findFirstEnv(API_KEY_ALIASES[provider] ?? [PROVIDER_ENV_KEYS[provider]]);
  if (!found) {
    return skip(provider, "api_key", `missing ${apiKeyNames(provider).join(" or ")}`);
  }

  if (!args.live) {
    return pass(provider, "api_key", `found ${found.key}; live call not requested`);
  }

  const adapter = createAdapter(provider, found.value);
  if (!adapter) return fail(provider, "api_key", "no runtime adapter is wired");

  try {
    const response = await withTimeout(
      adapter.complete({
        prompt: "Reply with exactly PARIX_SMOKE_OK.",
        temperature: 0,
        maxTokens: 16,
      }),
      args.timeoutMs,
    );
    if (!response.text.trim()) {
      return fail(provider, "api_key", "provider returned an empty response");
    }
    return pass(
      provider,
      "api_key",
      `live completion ok via ${adapter.id}/${response.model}`,
    );
  } catch (error) {
    return fail(
      provider,
      "api_key",
      error instanceof Error ? error.message : String(error),
    );
  }
}

function smokeAccountAuth(provider: string): SmokeResult {
  const capability = LLM_PROVIDER_CAPABILITIES[provider];
  if (!capability?.supportedAuthMethods.includes("account_auth")) {
    return skip(provider, "account_auth", "provider does not support account auth");
  }

  const envToken = findFirstEnv([accountTokenName(provider)]);
  if (envToken) {
    return pass(provider, "account_auth", `found ${envToken.key}`);
  }

  const profile = findAuthProfile(provider);
  if (profile) {
    return pass(provider, "account_auth", `found auth profile ${profile.id}`);
  }

  const command = findWorkingCommand(ACCOUNT_COMMANDS[provider] ?? []);
  if (command) {
    return pass(provider, "account_auth", `local auth command available: ${command}`);
  }

  return skip(
    provider,
    "account_auth",
    `no ${accountTokenName(provider)}, auth profile, or known CLI login found`,
  );
}

async function smokeLocal(
  provider: string,
  args: Args,
): Promise<SmokeResult> {
  if (provider !== "ollama" && provider !== "lmstudio") {
    return skip(provider, "local", "provider is not local-runtime based");
  }

  const baseUrl =
    provider === "ollama"
      ? process.env.OLLAMA_BASE_URL || "http://localhost:11434"
      : process.env.LMSTUDIO_BASE_URL || "http://localhost:1234/v1";

  if (!args.live) {
    return pass(provider, "local", `configured endpoint ${baseUrl}; live call not requested`);
  }

  try {
    const url =
      provider === "ollama"
        ? `${baseUrl.replace(/\/$/, "")}/api/tags`
        : `${baseUrl.replace(/\/$/, "")}/models`;
    const response = await withTimeout(fetch(url), args.timeoutMs);
    if (!response.ok) {
      return fail(provider, "local", `${url} returned HTTP ${response.status}`);
    }
    return pass(provider, "local", `runtime reachable at ${baseUrl}`);
  } catch (error) {
    return fail(
      provider,
      "local",
      error instanceof Error ? error.message : String(error),
    );
  }
}

function createAdapter(
  provider: string,
  apiKey: string,
): RuntimeProvider | null {
  const model = DEFAULT_MODELS[provider];
  switch (provider) {
    case "openai":
      return new ChatGPTAdapter({ apiKey, model });
    case "anthropic":
      return new AnthropicAdapter({ apiKey, model });
    case "groq":
      return new GroqAdapter({ apiKey, model });
    case "grok":
      return new GrokAdapter({ apiKey, model });
    case "perplexity":
      return new PerplexityAdapter({ apiKey, model });
    case "mistral":
      return new MistralAdapter({ apiKey, model });
    case "kimi":
      return new KimiAdapter({ apiKey, model });
    case "openrouter":
      return new OpenRouterAdapter({ apiKey, model });
    case "bytez":
      return new BytezAdapter({ apiKey, model });
    case "copilot":
      return new CopilotAdapter({ apiKey, model });
    case "deepseek":
      return new DeepSeekAdapter({ apiKey, model });
    case "ollama":
      return new OllamaAdapter({ model });
    case "lmstudio":
      return new LMStudioAdapter({ model });
    default:
      return null;
  }
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    live: false,
    provider: null,
    auth: "all",
    timeoutMs: 20_000,
  };

  for (const arg of argv) {
    if (arg === "--live") args.live = true;
    else if (arg.startsWith("--provider="))
      args.provider = arg.slice("--provider=".length).trim();
    else if (arg.startsWith("--auth=")) {
      const auth = arg.slice("--auth=".length) as AuthFilter;
      if (!["all", "api_key", "account_auth", "local"].includes(auth)) {
        throw new Error(`Unsupported --auth=${auth}`);
      }
      args.auth = auth;
    } else if (arg.startsWith("--timeout-ms=")) {
      args.timeoutMs = Number(arg.slice("--timeout-ms=".length));
    }
  }

  return args;
}

function loadEnv(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf-8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && value && !process.env[key]) process.env[key] = value;
  }
}

function findFirstEnv(keys: Array<string | undefined>): { key: string; value: string } | null {
  for (const key of keys) {
    if (!key) continue;
    const value = process.env[key];
    if (value) return { key, value };
  }
  return null;
}

function findAuthProfile(provider: string): { id: string } | null {
  const path = resolve(PARIX_HOME, "auth-profiles.json");
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, "utf-8")) as {
      profiles?: Array<{ id?: string; provider?: string; status?: string }>;
    };
    const profile = data.profiles?.find(
      (item) => item.provider === provider && item.status === "configured",
    );
    return profile?.id ? { id: profile.id } : null;
  } catch {
    return null;
  }
}

function findWorkingCommand(commands: string[][]): string | null {
  for (const command of commands) {
    const result = spawnSync(command[0], command.slice(1), {
      stdio: "ignore",
      shell: false,
      timeout: 5000,
    });
    if (!result.error && result.status === 0) return command.join(" ");
  }
  return null;
}

function apiKeyNames(provider: string): string[] {
  const aliases = API_KEY_ALIASES[provider];
  if (aliases) return aliases;
  const key = PROVIDER_ENV_KEYS[provider];
  return key ? [key] : [];
}

function accountTokenName(provider: string): string {
  return `${provider.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_ACCOUNT_AUTH_TOKEN`;
}

function pass(provider: string, auth: AuthFilter, detail: string): SmokeResult {
  return { provider, auth, status: "pass", detail };
}

function fail(provider: string, auth: AuthFilter, detail: string): SmokeResult {
  return { provider, auth, status: "fail", detail };
}

function skip(provider: string, auth: AuthFilter, detail: string): SmokeResult {
  return { provider, auth, status: "skip", detail };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs),
  );
  return Promise.race([promise, timeout]);
}

function printResults(results: SmokeResult[], live: boolean): void {
  console.log(`\nParix provider smoke tests (${live ? "live" : "dry-run"})\n`);
  for (const result of results) {
    const marker =
      result.status === "pass" ? "PASS" : result.status === "fail" ? "FAIL" : "SKIP";
    console.log(
      `${marker.padEnd(4)} ${result.provider.padEnd(11)} ${result.auth.padEnd(12)} ${result.detail}`,
    );
  }

  const counts = results.reduce(
    (acc, result) => {
      acc[result.status] += 1;
      return acc;
    },
    { pass: 0, fail: 0, skip: 0 } as Record<Status, number>,
  );
  console.log(
    `\nSummary: ${counts.pass} pass, ${counts.skip} skip, ${counts.fail} fail`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
