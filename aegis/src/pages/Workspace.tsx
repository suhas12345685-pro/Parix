import type { WorkspaceFile } from "../types";

interface Props {
  files: WorkspaceFile[];
  onInit: () => void;
}

const REQUIRED_FILES = [
  "IDENTITY.md",
  "SOUL.md",
  "USER.md",
  "AGENTS.md",
  "TOOLS.md",
  "HEARTBEAT.md",
  "MEMORY.md",
  "memory/YYYY-MM-DD.md",
  "checklists/critical-action.md",
];

export function Workspace({ files, onInit }: Props) {
  const known = new Map(
    files.map((file) => [normalize(file.path), file.exists]),
  );

  return (
    <div className="space-y-5">
      <section className="card">
        <div className="flex items-start justify-between gap-5">
          <div>
            <h2 className="text-xl font-semibold text-white">
              Workspace Markdown Stack
            </h2>
            <p className="mt-1 text-sm leading-6 text-[#a99bb9]">
              Hatchery asks identity during setup, then initializes the Parix
              workspace files adapted from the OpenClaw structure.
            </p>
          </div>
          <button
            type="button"
            onClick={onInit}
            className="rounded-xl border border-pink-300/30 bg-gradient-to-br from-pink-500 to-fuchsia-700 px-6 py-3 text-sm font-semibold text-white shadow-[0_0_30px_rgba(236,72,153,0.4)]"
          >
            Initialize Files
          </button>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        {REQUIRED_FILES.map((path) => {
          const exists =
            known.get(normalize(path)) ?? path.includes("YYYY-MM-DD");
          return (
            <div
              key={path}
              className="card flex items-center justify-between gap-4"
            >
              <div>
                <div className="font-mono text-sm text-white">{path}</div>
                <div className="mt-1 text-xs text-[#a99bb9]">
                  {descriptionFor(path)}
                </div>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs ${exists ? "bg-pink-500/20 text-pink-200" : "bg-purple-500/10 text-[#a99bb9]"}`}
              >
                {exists ? "Ready" : "Missing"}
              </span>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/\d{4}-\d{2}-\d{2}/, "YYYY-MM-DD");
}

function descriptionFor(path: string): string {
  if (path === "SOUL.md") return "Persona, values, tone, and emotional core.";
  if (path === "IDENTITY.md")
    return "Public agent metadata and routing identity.";
  if (path === "USER.md")
    return "Operator facts, preferences, schedules, and work parameters.";
  if (path === "AGENTS.md") return "Operational rules and standard procedures.";
  if (path === "TOOLS.md")
    return "Environments, paths, device config, and authorized destinations.";
  if (path === "HEARTBEAT.md") return "Background routines and idle behavior.";
  if (path === "MEMORY.md")
    return "Permanent high-level memory and standing decisions.";
  if (path.startsWith("memory/"))
    return "Daily chronological scratchpad for distillation.";
  return "Guardrails for critical execution cycles.";
}
