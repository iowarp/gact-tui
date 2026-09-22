import { describe, expect, it } from 'vitest';
import { TOOL_DOMAIN_LABELS, toolDomainLabel, type ToolDomain } from './tool-domain-labels';

/** The full closed vocabulary, independent of the labels table — catches a token silently dropped from the table. */
const ALL_TOOL_DOMAINS: ToolDomain[] = [
  'workspace',
  'shell',
  'artifacts',
  'planning',
  'tasks',
  'schedules',
  'autonomy',
  'goals',
  'alerts',
  'resources',
  'surfaces',
  'providers',
  'memory',
  'agents',
  'workflows',
  'skills',
  'messaging',
  'interaction',
];

describe('tool domain labels', () => {
  it('every ToolDomain token has a non-empty label', () => {
    for (const domain of ALL_TOOL_DOMAINS) {
      expect(TOOL_DOMAIN_LABELS[domain]?.trim()).toBeTruthy();
    }
    // Symmetric: the table declares no token outside the closed vocabulary.
    expect(Object.keys(TOOL_DOMAIN_LABELS).sort()).toEqual([...ALL_TOOL_DOMAINS].sort());
  });

  it('resolves a recognized token through toolDomainLabel', () => {
    expect(toolDomainLabel('planning')).toBe('Planning');
    expect(toolDomainLabel('interaction')).toBe('Questions');
  });

  it('returns undefined for null, absent, or unrecognized domains', () => {
    expect(toolDomainLabel(null)).toBeUndefined();
    expect(toolDomainLabel(undefined)).toBeUndefined();
    expect(toolDomainLabel('not_a_real_domain')).toBeUndefined();
  });
});
