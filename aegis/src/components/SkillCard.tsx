import type { InstalledSkill } from "../types";

interface Props {
  skill: InstalledSkill;
}

export function SkillCard({ skill }: Props) {
  const activeParts = [
    "SKILL.md",
    skill.hasScripts ? "scripts" : null,
    skill.hasReferences ? "references" : null,
    skill.hasTemplates ? "templates" : null,
  ].filter(Boolean);

  return (
    <article className="rounded-lg border border-purple-400/20 bg-[#120b18]/75 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-white">
            {skill.id}
          </h3>
          <p className="mt-1 min-h-10 text-sm leading-5 text-[#b8aec5]">
            {skill.description || "No description provided."}
          </p>
        </div>
        {skill.source && (
          <span className="shrink-0 rounded-md border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-xs text-cyan-100">
            {skill.source}
          </span>
        )}
      </div>

      <div className="mt-4 truncate font-mono text-xs text-[#8f82a0]">
        {skill.path}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {activeParts.map((part) => (
          <span
            key={part}
            className="rounded-md border border-purple-300/15 bg-purple-300/10 px-2 py-1 text-xs text-[#d8cde6]"
          >
            {part}
          </span>
        ))}
      </div>
    </article>
  );
}
