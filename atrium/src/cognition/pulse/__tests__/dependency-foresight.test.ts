import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, initDb } from "../../../memory/db.js";
import type { CognitiveEvent } from "../../types.js";
import {
  getLastDependencyForesight,
  maybeCreateDependencyForesight,
} from "../dependency-foresight.js";
import { scanImports } from "../import-scanner.js";
import { getPulseMemory } from "../memory.js";
import { runPulsePrecompute } from "../precompute.js";

describe("Dependency Foresight", () => {
  let dir: string;
  let projectDir: string;
  let dbPath: string;
  let oldShadowDir: string | undefined;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "parix-dependency-foresight-"));
    projectDir = join(dir, "project");
    dbPath = join(dir, "memory.db");
    oldShadowDir = process.env.PARIX_SHADOW_DRAFTS_DIR;
    process.env.PARIX_SHADOW_DRAFTS_DIR = join(dir, "shadow_drafts");
    mkdirSync(join(projectDir, "src"), { recursive: true });
    await initDb(dbPath);
  });

  afterEach(() => {
    closeDb();
    if (oldShadowDir === undefined) {
      delete process.env.PARIX_SHADOW_DRAFTS_DIR;
    } else {
      process.env.PARIX_SHADOW_DRAFTS_DIR = oldShadowDir;
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it("detects a missing external npm package", () => {
    writePackageJson({ dependencies: {} });
    const filePath = writeSource(
      "missing.ts",
      `import { createClient } from "@supabase/supabase-js";\n`,
    );

    const draft = maybeCreateDependencyForesight(fileChangedEvent(filePath));

    expect(draft).not.toBeNull();
    expect(draft!.missingImports.map((item) => item.packageName)).toEqual([
      "@supabase/supabase-js",
    ]);
    expect(draft!.suggestedCommands).toContain(
      "npm install @supabase/supabase-js",
    );
  });

  it("ignores local relative imports", () => {
    const imports = scanImports(
      `import { logger } from "./utils/logger";\nimport thing from "../thing";\n`,
      "ts",
    );

    expect(imports).toEqual([]);
  });

  it("ignores Node.js built-ins", () => {
    const imports = scanImports(
      `import fs from "fs";\nimport path from "node:path";\nconst crypto = require("crypto");\n`,
      "ts",
    );

    expect(imports).toEqual([]);
  });

  it("creates a Ghost PR shadow draft with the correct npm install command", () => {
    writePackageJson({ dependencies: { react: "^18.0.0" } });
    const filePath = writeSource(
      "ghost-pr.ts",
      `import React from "react";\nimport { createClient } from "@supabase/supabase-js";\n`,
    );

    const draft = maybeCreateDependencyForesight(fileChangedEvent(filePath));

    expect(draft).not.toBeNull();
    expect(draft!.draftPath).toContain("dependency-foresight");
    const body = readFileSync(draft!.draftPath, "utf-8");
    expect(body).toContain("# Dependency Foresight Ghost PR");
    expect(body).toContain("npm install @supabase/supabase-js");
    expect(body).toContain("@supabase/supabase-js");

    const remembered = getPulseMemory("last_dependency_foresight");
    expect(remembered?.value).toMatchObject({
      importHash: draft!.importHash,
      draftPath: draft!.draftPath,
    });
  });

  it("does not create a draft for declared packages", () => {
    writePackageJson({
      dependencies: { "@supabase/supabase-js": "^2.0.0" },
    });
    const filePath = writeSource(
      "declared.ts",
      `import { createClient } from "@supabase/supabase-js";\n`,
    );

    const draft = maybeCreateDependencyForesight(fileChangedEvent(filePath));

    expect(draft).toBeNull();
  });

  it("debounces identical file hashes for two seconds", () => {
    writePackageJson({ dependencies: {} });
    const filePath = writeSource(
      "debounce.ts",
      `import { createClient } from "@supabase/supabase-js";\n`,
    );

    const first = maybeCreateDependencyForesight(fileChangedEvent(filePath));
    const second = maybeCreateDependencyForesight(fileChangedEvent(filePath));

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it("persists dependency foresight across DB restart", async () => {
    writePackageJson({ dependencies: {} });
    const filePath = writeSource(
      "persist.ts",
      `import { createClient } from "@supabase/supabase-js";\n`,
    );

    const draft = maybeCreateDependencyForesight(fileChangedEvent(filePath));
    expect(draft).not.toBeNull();

    closeDb();
    await initDb(dbPath);

    const restored = getLastDependencyForesight();
    expect(restored?.importHash).toBe(draft!.importHash);
  });

  it("runs dependency foresight before Error-Shadow in System 1.6 precompute", () => {
    writePackageJson({ dependencies: {} });
    const filePath = writeSource(
      "priority.ts",
      `import { createClient } from "@supabase/supabase-js";\n`,
    );
    const event = fileChangedEvent(filePath, {
      output: "Error: Cannot find module '@supabase/supabase-js'",
      stderr: "Error: Cannot find module '@supabase/supabase-js'",
    });
    event.type = "terminal_error";

    const results = runPulsePrecompute(event);

    expect(results.map((result) => result.kind)).toEqual([
      "dependency_foresight",
      "error_shadow",
    ]);
  });

  function writePackageJson(pkg: Record<string, unknown>): void {
    writeFileSync(
      join(projectDir, "package.json"),
      JSON.stringify({ name: "fixture", version: "1.0.0", ...pkg }, null, 2),
      "utf-8",
    );
  }

  function writeSource(name: string, content: string): string {
    const filePath = join(projectDir, "src", name);
    writeFileSync(filePath, content, "utf-8");
    return filePath;
  }

  function fileChangedEvent(
    filePath: string,
    extraData: Record<string, unknown> = {},
  ): CognitiveEvent {
    return {
      type: "file_changed",
      data: {
        cwd: projectDir,
        file_path: filePath,
        ...extraData,
      },
      confidence: 0.94,
      timestamp: Date.now() / 1000,
    };
  }
});
