import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');
const AGENT_SKILLS_DIR = resolve(PROJECT_ROOT, '.agents/skills');

export interface InstalledSkillSummary {
  id: string;
  path: string;
  description: string;
  hasScripts: boolean;
  hasReferences: boolean;
  hasTemplates: boolean;
  source: string;
  updatedAt: number;
}

export function listInstalledSkills(
  skillsDir = AGENT_SKILLS_DIR
): InstalledSkillSummary[] {
  if (!existsSync(skillsDir)) return [];

  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const skillPath = join(skillsDir, entry.name);
      const stats = statSync(skillPath);

      return {
        id: entry.name,
        path: skillPath,
        description: readDescription(join(skillPath, 'SKILL.md')),
        hasScripts: existsSync(join(skillPath, 'scripts')),
        hasReferences: existsSync(join(skillPath, 'references')),
        hasTemplates: existsSync(join(skillPath, 'templates')),
        source: 'local',
        updatedAt: stats.mtimeMs,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function formatInstalledSkillLines(
  skills: InstalledSkillSummary[],
  limit = 8
): string[] {
  if (skills.length === 0) return ['  No installed .agents skills found yet.'];

  const shown = skills.slice(0, limit).map((skill) => {
    const parts = [
      skill.hasScripts ? 'scripts' : null,
      skill.hasReferences ? 'references' : null,
      skill.hasTemplates ? 'templates' : null,
    ].filter(Boolean);
    const suffix = parts.length > 0 ? ` (${parts.join(', ')})` : '';
    return `  - ${skill.id}${suffix}`;
  });

  if (skills.length > limit) {
    shown.push(`  - and ${skills.length - limit} more`);
  }

  return shown;
}

function readDescription(skillFile: string): string {
  if (!existsSync(skillFile)) return '';
  const raw = readFileSync(skillFile, 'utf-8');
  const frontmatter = raw.match(/^---\s*([\s\S]*?)\s*---/);
  const descriptionLine = frontmatter?.[1]
    .split(/\r?\n/)
    .find((line) => line.trim().startsWith('description:'));
  const description = descriptionLine
    ?.replace(/^description:\s*/i, '')
    .trim()
    .replace(/^["']|["']$/g, '');
  if (description) return description;

  return (
    raw
      .replace(/^---\s*[\s\S]*?\s*---/, '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('#')) ?? ''
  );
}
