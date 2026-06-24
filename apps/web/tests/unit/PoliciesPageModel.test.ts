import { describe, expect, it } from 'vitest';
import {
  parsePolicyDraft,
  policyDocumentFromResponse,
  policyDraft,
  policyEntries,
} from '../../src/routes/discovery/PoliciesPageModel.js';

describe('PoliciesPageModel', () => {
  it('normalizes missing or malformed responses to an empty policy list', () => {
    expect(policyDocumentFromResponse(null)).toEqual([]);
    expect(policyDocumentFromResponse({})).toEqual([]);
    expect(policyDocumentFromResponse({ policies: 'invalid' })).toEqual([]);
  });

  it('keeps array and object policy documents', () => {
    const list = [{ allow: 'shell' }];
    const object = { tools: { shell: 'ask' } };
    expect(policyDocumentFromResponse({ policies: list })).toBe(list);
    expect(policyDocumentFromResponse({ policies: object })).toBe(object);
  });

  it('builds display entries for array and object policies', () => {
    expect(policyEntries(['a', 'b'])).toEqual([
      ['0', 'a'],
      ['1', 'b'],
    ]);
    expect(policyEntries({ tools: 'ask', memory: 'allow' })).toEqual([
      ['tools', 'ask'],
      ['memory', 'allow'],
    ]);
  });

  it('formats policy documents for editing', () => {
    expect(policyDraft({ tools: ['shell'] })).toBe('{\n  "tools": [\n    "shell"\n  ]\n}');
  });

  it('parses valid object and array drafts', () => {
    expect(parsePolicyDraft('{"tools":"ask"}')).toEqual({
      ok: true,
      value: { tools: 'ask' },
    });
    expect(parsePolicyDraft('[{"tool":"shell"}]')).toEqual({
      ok: true,
      value: [{ tool: 'shell' }],
    });
  });

  it('rejects invalid JSON and scalar JSON drafts', () => {
    expect(parsePolicyDraft('{').ok).toBe(false);
    expect(parsePolicyDraft('"allow"')).toEqual({
      ok: false,
      error: 'Invalid JSON: policies must be an object or array',
    });
  });
});
