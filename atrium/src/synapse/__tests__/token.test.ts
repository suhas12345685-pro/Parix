import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { loadSynapseToken } from "../token.js";

const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_USERPROFILE = process.env.USERPROFILE;
const ORIGINAL_TOKEN_ENV = process.env.PARIX_SYNAPSE_TOKEN;

let sandbox: string;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "parix-token-test-"));
  process.env.HOME = sandbox;
  process.env.USERPROFILE = sandbox;
  delete process.env.PARIX_SYNAPSE_TOKEN;
});

afterEach(() => {
  if (ORIGINAL_HOME === undefined) delete process.env.HOME;
  else process.env.HOME = ORIGINAL_HOME;
  if (ORIGINAL_USERPROFILE === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = ORIGINAL_USERPROFILE;
  if (ORIGINAL_TOKEN_ENV === undefined) delete process.env.PARIX_SYNAPSE_TOKEN;
  else process.env.PARIX_SYNAPSE_TOKEN = ORIGINAL_TOKEN_ENV;
  rmSync(sandbox, { recursive: true, force: true });
});

describe("loadSynapseToken", () => {
  it("returns null when no env and no token file exists", () => {
    expect(loadSynapseToken()).toBeNull();
  });

  it("reads the token from ~/.parix/synapse-token", () => {
    mkdirSync(join(sandbox, ".parix"), { recursive: true });
    writeFileSync(join(sandbox, ".parix", "synapse-token"), "tok-from-file\n");
    expect(loadSynapseToken()).toBe("tok-from-file");
  });

  it("env var overrides the token file", () => {
    mkdirSync(join(sandbox, ".parix"), { recursive: true });
    writeFileSync(join(sandbox, ".parix", "synapse-token"), "tok-from-file");
    process.env.PARIX_SYNAPSE_TOKEN = "tok-from-env";
    expect(loadSynapseToken()).toBe("tok-from-env");
  });

  it("ignores blank env var and falls back to file", () => {
    mkdirSync(join(sandbox, ".parix"), { recursive: true });
    writeFileSync(join(sandbox, ".parix", "synapse-token"), "tok-from-file");
    process.env.PARIX_SYNAPSE_TOKEN = "   ";
    expect(loadSynapseToken()).toBe("tok-from-file");
  });

  it("ignores an empty token file", () => {
    mkdirSync(join(sandbox, ".parix"), { recursive: true });
    writeFileSync(join(sandbox, ".parix", "synapse-token"), "\n");
    expect(loadSynapseToken()).toBeNull();
  });
});
