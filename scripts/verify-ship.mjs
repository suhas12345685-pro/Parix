import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

function npmInvoker() {
  if (process.platform !== "win32") {
    return { command: "npm", prefix: [] };
  }

  const candidates = [
    join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    process.env.APPDATA
      ? join(process.env.APPDATA, "npm", "node_modules", "npm", "bin", "npm-cli.js")
      : "",
  ].filter(Boolean);

  const npmCli = candidates.find((candidate) => existsSync(candidate));
  if (!npmCli) {
    console.error("[verify:ship] Could not locate npm-cli.js for this Node installation.");
    process.exit(1);
  }

  return { command: process.execPath, prefix: [npmCli] };
}

const npm = npmInvoker();
const python = "python";

function npmStep(label, args) {
  return [label, npm.command, [...npm.prefix, ...args]];
}

const steps = [
  npmStep("Workspace build", ["run", "build:all"]),
  npmStep("Lint", ["run", "lint"]),
  npmStep("Atrium tests", ["test"]),
  npmStep("Atrium coverage", ["run", "test:coverage"]),
  ["Hands tests", python, ["-m", "pytest", "hands/tests"]],
  ["Hands compile", python, ["-m", "compileall", "hands"]],
  npmStep("Skill manifests", ["run", "skills:validate"]),
  npmStep("End-to-end pipeline", ["run", "test:e2e"]),
  npmStep("High-severity dependency audit", ["audit", "--audit-level=high"]),
];

for (const [label, command, args] of steps) {
  console.log(`\n[verify:ship] ${label}`);
  console.log(`[verify:ship] $ ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    if (result.error) {
      console.error(`[verify:ship] ${result.error.message}`);
    }
    console.error(`\n[verify:ship] FAILED: ${label}`);
    process.exit(result.status ?? 1);
  }
}

console.log("\n[verify:ship] All ship checks passed.");
