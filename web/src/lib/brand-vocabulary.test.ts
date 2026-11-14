import { brand } from '@brand';
import { describe, expect, it } from 'vitest';

import { PROTOCOL, capitalize, vocab, welcomePlaceholder, withArticle } from './brand-vocabulary';

describe('withArticle', () => {
  it('picks A or An from the noun', () => {
    expect(withArticle('CLIO')).toBe('A CLIO');
    expect(withArticle('Agent')).toBe('An Agent');
  });
});

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

describe('welcomePlaceholder', () => {
  it('names the chosen agent, so the first screen shows one name', () => {
    expect(welcomePlaceholder('Helper')).toBe('Ask Helper anything, or describe a task…');
  });

  it('names the product until an agent is known', () => {
    expect(welcomePlaceholder()).toBe(`Ask ${brand.name} anything, or describe a task…`);
    expect(welcomePlaceholder('  ')).toBe(`Ask ${brand.name} anything, or describe a task…`);
  });
});
