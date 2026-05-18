import { useState } from "react";
import type { InstalledSkill } from "../types";
import { EmptyState } from "../components/EmptyState";
import { SkillCard } from "../components/SkillCard";

interface Props {
  skills: InstalledSkill[];
  onCreate: (skill: {
    name: string;
    description: string;
    source: string;
    requirements: string[];
    secrets: Record<string, string>;
  }) => void;
}

const MARKETPLACE = [
  {
    id: "parix-marketplace",
    label: "Parix Marketplace",
    detail: ".agents/skills ready skills",
  },
  {
    id: "vercel-labs",
    label: "Vercel Labs",
    detail: "Vercel workflow and app skills",
  },
  { id: "skills-sh", label: "skills.sh", detail: "Community skill source" },
];

export function Skills({ skills, onCreate }: Props) {
  const [name, setName] = useState("data-cleaning");
  const [description, setDescription] = useState(
    "Clean and normalize user-provided datasets.",
  );
  const [source, setSource] = useState("parix-marketplace");
  const [requirementsText, setRequirementsText] = useState("OPENAI_API_KEY");
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});

  const requirements = requirementsText
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-3">
        {MARKETPLACE.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSource(item.id)}
            className={`card text-left transition ${source === item.id ? "border-pink-400/50 bg-pink-500/10" : ""}`}
          >
            <div className="text-base font-semibold text-white">
              {item.label}
            </div>
            <div className="mt-1 text-sm text-[#a99bb9]">{item.detail}</div>
          </button>
        ))}
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold text-white">
          Create / Setup Skill
        </h2>
        <p className="mt-1 text-sm text-[#a99bb9]">
          Hatchery creates the real .agents/skills/skill-name structure and asks
          for required API/config values.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded-xl border border-purple-400/25 bg-[#0e0714] px-4 py-3 text-white outline-none focus:border-pink-400/60"
            placeholder="Skill name, e.g. XYZ"
          />
          <input
            value={requirementsText}
            onChange={(event) => setRequirementsText(event.target.value)}
            className="rounded-xl border border-purple-400/25 bg-[#0e0714] px-4 py-3 text-white outline-none focus:border-pink-400/60"
            placeholder="Required keys, comma separated"
          />
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            className="resize-none rounded-xl border border-purple-400/25 bg-[#0e0714] px-4 py-3 text-white outline-none focus:border-pink-400/60 md:col-span-2"
            placeholder="What does this skill do?"
          />
        </div>
        {requirements.length > 0 && (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {requirements.map((requirement) => (
              <input
                key={requirement}
                value={secretValues[requirement] ?? ""}
                onChange={(event) =>
                  setSecretValues((current) => ({
                    ...current,
                    [requirement]: event.target.value,
                  }))
                }
                className="rounded-xl border border-purple-400/25 bg-[#0e0714] px-4 py-3 text-white outline-none focus:border-pink-400/60"
                placeholder={`Value for ${requirement}`}
              />
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() =>
            onCreate({
              name,
              description,
              source,
              requirements,
              secrets: secretValues,
            })
          }
          className="mt-5 rounded-xl border border-pink-300/30 bg-gradient-to-br from-pink-500 to-fuchsia-700 px-7 py-3 text-sm font-semibold text-white shadow-[0_0_30px_rgba(236,72,153,0.4)]"
        >
          Create Skill
        </button>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#8f82a0]">
            Installed Skills
          </h2>
          <span className="rounded-md border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-xs text-cyan-100">
            {skills.length}
          </span>
        </div>
        {skills.length === 0 ? (
          <EmptyState
            title="No installed skills"
            detail="Created or discovered skills will be listed here."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {skills.map((skill) => (
              <SkillCard key={skill.id} skill={skill} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
