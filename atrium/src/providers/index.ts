/**
 * Parix multi-provider core — public surface + factory.
 *
 *   import { createProviderRouter } from "./providers/index.js";
 *   const router = await createProviderRouter();
 *   const answer = await router.sendAgentChat("hello", { provider: "claude" });
 *
 * Config is read from ~/.parix/config.json (`modelProviders` block). Each
 * provider runs in "api" or "cli" mode. See BaseProvider.ts for the contract.
 */
export * from "./BaseProvider.js";
export { SilentCliBridge, stripAnsi } from "./SilentCliBridge.js";
export { OpenAIProvider } from "./OpenAIProvider.js";
export { ClaudeProvider } from "./ClaudeProvider.js";
export { GeminiProvider } from "./GeminiProvider.js";

import {
  type IParixProvider,
  type ModelProvidersConfig,
  type ProviderConfigEntry,
  type ProviderId,
  ProviderRouter,
  loadProvidersConfig,
} from "./BaseProvider.js";
import { OpenAIProvider } from "./OpenAIProvider.js";
import { ClaudeProvider } from "./ClaudeProvider.js";
import { GeminiProvider } from "./GeminiProvider.js";

function makeProvider(id: ProviderId, cfg: ProviderConfigEntry): IParixProvider {
  switch (id) {
    case "openai":
      return new OpenAIProvider(cfg);
    case "claude":
      return new ClaudeProvider(cfg);
    case "gemini":
      return new GeminiProvider(cfg);
    default:
      throw new Error(`unknown provider id: ${id as string}`);
  }
}

/**
 * Build + initialize a router from config (or an explicit config object).
 * Providers that fail to initialize are skipped (logged), so one bad key
 * doesn't sink the whole router.
 */
export async function createProviderRouter(
  config?: ModelProvidersConfig,
): Promise<ProviderRouter> {
  const cfg = config ?? (await loadProvidersConfig());
  const ready: IParixProvider[] = [];
  for (const [id, entry] of Object.entries(cfg.providers)) {
    if (!entry) continue;
    const provider = makeProvider(id as ProviderId, entry);
    try {
      await provider.initialize();
      ready.push(provider);
    } catch (err) {
      console.warn(
        `[providers] skipping ${id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  if (ready.length === 0) {
    throw new Error("[providers] no provider initialized — check ~/.parix/config.json + credentials");
  }
  return new ProviderRouter(ready, cfg.default);
}
