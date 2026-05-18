/**
 * Tests for shared/hatchery-schema.ts — validation, defaults, type guards.
 */

import { describe, it, expect } from 'vitest';
import {
  createDefaultProfile,
  validateProfile,
  isPersonalProfile,
  isEnterpriseProfile,
  PERSONAL_DEFAULTS,
  ENTERPRISE_DEFAULTS,
  HATCHERY_MODULES,
  LLM_PROVIDER_CAPABILITIES,
  LLM_PROVIDERS,
  type ParixProfile,
} from '../../shared/hatchery-schema.js';

describe('createDefaultProfile', () => {
  it('creates a valid personal profile', () => {
    const profile = createDefaultProfile('personal');
    expect(profile.version).toBe('1.0');
    expect(profile.mode).toBe('personal');
    expect(profile.permissions).toEqual(PERSONAL_DEFAULTS);
    expect(isPersonalProfile(profile)).toBe(true);
    expect(isEnterpriseProfile(profile)).toBe(false);
  });

  it('creates a valid enterprise profile', () => {
    const profile = createDefaultProfile('enterprise');
    expect(profile.version).toBe('1.0');
    expect(profile.mode).toBe('enterprise');
    expect(profile.permissions).toEqual(ENTERPRISE_DEFAULTS);
    expect(isPersonalProfile(profile)).toBe(false);
    expect(isEnterpriseProfile(profile)).toBe(true);
  });

  it('personal defaults have activeWindow=true, enterprise has it false', () => {
    const personal = createDefaultProfile('personal');
    const enterprise = createDefaultProfile('enterprise');
    expect(personal.permissions.activeWindow).toBe(true);
    expect(enterprise.permissions.activeWindow).toBe(false);
  });

  it('personal defaults to safe-auto-fix autonomy', () => {
    const profile = createDefaultProfile('personal');
    if (isPersonalProfile(profile)) {
      expect(profile.personality.autonomyLevel).toBe('safe-auto-fix');
      expect(profile.agentProfile.mode).toBe('personal');
      expect(profile.agentProfile.agentName).toBe('Parix');
      expect(profile.agentProfile.memoryPreferences.rememberProjectContext).toBe(true);
    }
  });

  it('enterprise defaults to always-ask approval', () => {
    const profile = createDefaultProfile('enterprise');
    if (isEnterpriseProfile(profile)) {
      expect(profile.personality.approvalPolicy).toBe('always-ask');
      expect(profile.personality.safetyBoundary).toBe('strict');
      expect(profile.agentProfile.mode).toBe('enterprise');
      expect(profile.agentProfile.auditLoggingEnabled).toBe(true);
      expect(profile.agentProfile.approvalRequiredActions).toContain('change production systems');
    }
  });

  it('defaults LLM auth to API key config', () => {
    const profile = createDefaultProfile('personal');
    expect(profile.llm.provider).toBe('openai');
    expect(profile.llm.authMethod).toBe('api_key');
    expect(profile.llm.authProfileId).toBe(null);
  });

  it('defaults Aegis voice as the primary always-on channel', () => {
    const profile = createDefaultProfile('personal');
    expect(profile.channels.primary).toBe('aegis');
    expect(profile.channels.enabled).toContain('aegis');
    expect(profile.channels.settings.aegis).toMatchObject({
      kind: 'voice',
      autoStart: 'true',
      wakeWord: 'aegis',
    });
  });

  it('defaults Hatchery modules to lazy-loaded workers', () => {
    const personal = createDefaultProfile('personal');
    const enterprise = createDefaultProfile('enterprise');

    expect(personal.hatcheryModules.lazyLoad).toBe(true);
    expect(enterprise.hatcheryModules.lazyLoad).toBe(true);
    expect(enterprise.hatcheryModules.enabled).toContain('audit-logger');
    for (const module of personal.hatcheryModules.enabled) {
      expect(HATCHERY_MODULES.some((item) => item.id === module)).toBe(true);
    }
  });
});

describe('validateProfile', () => {
  it('accepts a valid personal profile', () => {
    const profile = createDefaultProfile('personal');
    const result = validateProfile(profile);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts a valid enterprise profile', () => {
    const profile = createDefaultProfile('enterprise');
    const result = validateProfile(profile);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects null input', () => {
    const result = validateProfile(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Profile must be a non-null object');
  });

  it('rejects non-object input', () => {
    const result = validateProfile('string');
    expect(result.valid).toBe(false);
  });

  it('rejects wrong version', () => {
    const profile = createDefaultProfile('personal');
    (profile as any).version = '2.0';
    const result = validateProfile(profile);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('version'))).toBe(true);
  });

  it('rejects invalid mode', () => {
    const profile = createDefaultProfile('personal');
    (profile as any).mode = 'team';
    const result = validateProfile(profile);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('mode'))).toBe(true);
  });

  it('rejects missing identity', () => {
    const profile = createDefaultProfile('personal');
    delete (profile as any).identity;
    const result = validateProfile(profile);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('identity'))).toBe(true);
  });

  it('rejects missing llm section', () => {
    const profile = createDefaultProfile('personal');
    delete (profile as any).llm;
    const result = validateProfile(profile);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('llm'))).toBe(true);
  });

  it('rejects missing channels section', () => {
    const profile = createDefaultProfile('personal');
    delete (profile as any).channels;
    const result = validateProfile(profile);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('channels'))).toBe(true);
  });

  it('rejects profiles without the default Aegis channel', () => {
    const profile = createDefaultProfile('personal');
    profile.channels.enabled = ['desktop'];

    const result = validateProfile(profile);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('aegis'))).toBe(true);
  });

  it('rejects missing permissions section', () => {
    const profile = createDefaultProfile('personal');
    delete (profile as any).permissions;
    const result = validateProfile(profile);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('permissions'))).toBe(true);
  });

  it('rejects non-boolean permission values', () => {
    const profile = createDefaultProfile('personal');
    (profile.permissions as any).terminalErrors = 'yes';
    const result = validateProfile(profile);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('terminalErrors'))).toBe(true);
  });

  it('rejects missing personality section', () => {
    const profile = createDefaultProfile('personal');
    delete (profile as any).personality;
    const result = validateProfile(profile);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('personality'))).toBe(true);
  });

  it('validates enterprise identity fields', () => {
    const profile = createDefaultProfile('enterprise');
    (profile.identity as any).companyName = 42;
    const result = validateProfile(profile);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('companyName'))).toBe(true);
  });

  it('reports multiple errors at once', () => {
    const result = validateProfile({
      version: '3.0',
      mode: 'invalid',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('accepts account-auth LLM profiles', () => {
    const profile = createDefaultProfile('personal');
    profile.llm.provider = 'openai';
    profile.llm.authMethod = 'account_auth';
    profile.llm.authProfileId = 'openai:account:default';

    expect(validateProfile(profile)).toEqual({ valid: true, errors: [] });
  });

  it('rejects invalid LLM auth methods', () => {
    const profile = createDefaultProfile('personal');
    (profile.llm as any).authMethod = 'browser-cookie';

    const result = validateProfile(profile);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('authMethod'))).toBe(true);
  });
});

describe('LLM provider capabilities', () => {
  it('marks all cloud providers account auth as first-class with API key fallback', () => {
    for (const provider of LLM_PROVIDERS) {
      if (provider === 'ollama' || provider === 'lmstudio') continue;
      expect(LLM_PROVIDER_CAPABILITIES[provider].supportedAuthMethods).toContain('account_auth');
      expect(LLM_PROVIDER_CAPABILITIES[provider].supportedAuthMethods).toContain('api_key');
    }
  });

  it('keeps local providers on local runtime auth', () => {
    expect(LLM_PROVIDER_CAPABILITIES.ollama.defaultAuthMethod).toBe('local');
    expect(LLM_PROVIDER_CAPABILITIES.lmstudio.defaultAuthMethod).toBe('local');
  });

  it('has capability metadata for every selectable provider', () => {
    expect(LLM_PROVIDERS).not.toContain('gemini');
    for (const provider of LLM_PROVIDERS) {
      expect(LLM_PROVIDER_CAPABILITIES[provider]).toBeDefined();
      expect(LLM_PROVIDER_CAPABILITIES[provider].id).toBe(provider);
    }
  });
});

describe('type guards', () => {
  it('isPersonalProfile returns true for personal mode', () => {
    const profile = createDefaultProfile('personal');
    expect(isPersonalProfile(profile)).toBe(true);
    expect(isEnterpriseProfile(profile)).toBe(false);
  });

  it('isEnterpriseProfile returns true for enterprise mode', () => {
    const profile = createDefaultProfile('enterprise');
    expect(isEnterpriseProfile(profile)).toBe(true);
    expect(isPersonalProfile(profile)).toBe(false);
  });
});

describe('profile round-trip', () => {
  it('a created default profile passes validation', () => {
    for (const mode of ['personal', 'enterprise'] as const) {
      const profile = createDefaultProfile(mode);
      const result = validateProfile(profile);
      expect(result.valid).toBe(true);
    }
  });

  it('JSON.parse(JSON.stringify(profile)) still validates', () => {
    const profile = createDefaultProfile('personal');
    const roundTripped = JSON.parse(JSON.stringify(profile));
    const result = validateProfile(roundTripped);
    expect(result.valid).toBe(true);
  });
});
