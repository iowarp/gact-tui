import { brand } from '@brand';
import { describe, expect, it } from 'vitest';

import { PROTOCOL, capitalize, vocab } from './brand-vocabulary';

describe('vocab', () => {
  it('reads product/agent/workspace nouns straight from the resolved brand', () => {
    expect(vocab.product).toBe(brand.productName);
    expect(vocab.agent).toBe(brand.agentName);
    expect(vocab.workspace).toBe(brand.workspaceNoun);
  });

  it('never falls back to a hardcoded brand name — the active brand always resolves a value', () => {
    expect(vocab.product.length).toBeGreaterThan(0);
    expect(vocab.agent.length).toBeGreaterThan(0);
    expect(vocab.workspace.length).toBeGreaterThan(0);
  });
});

describe('capitalize', () => {
  it('upper-cases only the first character', () => {
    expect(capitalize('workspace')).toBe('Workspace');
    expect(capitalize('a')).toBe('A');
  });

  it('leaves an already-capitalized or empty string alone', () => {
    expect(capitalize('Workspace')).toBe('Workspace');
    expect(capitalize('')).toBe('');
  });
});

describe('PROTOCOL', () => {
  it('names both protocols explicitly, never a bare acronym', () => {
    expect(PROTOCOL.a2ui).toBe('A2UI protocol');
    expect(PROTOCOL.gact).toBe('GACT protocol');
  });
});
