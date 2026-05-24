import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { tmpdir } from 'os';
import { writeIdentityFiles } from '../src/config-writer.js';
import type { ParixProfile } from '../../shared/hatchery-schema.js';

describe('writeIdentityFiles', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = resolve(tmpdir(), `parix-test-${Date.now()}`);
    mkdirSync(testRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it('generates MEMORY.md, USER.md, and SOUL.md with correct personal data', () => {
    const profile: any = {
      agentProfile: {
        mode: 'personal',
        userName: 'Test User',
        agentName: 'TestAgent',
        techStack: 'TypeScript, Rust',
        proactivity: 'proactive',
        tone: 'philosophical',
        mainMission: 'Build great things',
        vibe: 'zen',
        personality: 'I am a tester',
        primaryGoals: ['test everything', 'stay green'],
      },
    };

    writeIdentityFiles(profile as ParixProfile, testRoot);

    expect(existsSync(join(testRoot, 'MEMORY.md'))).toBe(true);
    expect(existsSync(join(testRoot, 'USER.md'))).toBe(true);
    expect(existsSync(join(testRoot, 'SOUL.md'))).toBe(true);

    const memory = readFileSync(join(testRoot, 'MEMORY.md'), 'utf-8');
    expect(memory).toContain('Operator: Test User');
    expect(memory).toContain('Tech Stack: TypeScript, Rust');
    expect(memory).toContain('Proactivity: proactive');

    const user = readFileSync(join(testRoot, 'USER.md'), 'utf-8');
    expect(user).toContain('Main Mission');
    expect(user).toContain('Build great things');

    const soul = readFileSync(join(testRoot, 'SOUL.md'), 'utf-8');
    expect(soul).toContain('Vibe');
    expect(soul).toContain('zen');
    expect(soul).toContain('test everything');
  });

  it('generates correct data for enterprise mode', () => {
    const profile: any = {
      agentProfile: {
        mode: 'enterprise',
        agentName: 'CorpAgent',
        roleDescription: 'Corporate bot',
        techStack: 'Java, COBOL',
        proactivity: 'reactive',
        tone: 'professional',
        mainMission: 'Compliance',
        vibe: 'strict',
        personality: 'Standard procedure',
        responsibilities: ['audit logs', 'report errors'],
      },
    };

    writeIdentityFiles(profile as ParixProfile, testRoot);

    const memory = readFileSync(join(testRoot, 'MEMORY.md'), 'utf-8');
    expect(memory).toContain('Operator: Enterprise User');
    expect(memory).toContain('Tech Stack: Java, COBOL');

    const soul = readFileSync(join(testRoot, 'SOUL.md'), 'utf-8');
    expect(soul).toContain('audit logs');
  });
});
