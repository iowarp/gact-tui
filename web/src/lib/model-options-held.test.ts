import { describe, expect, it } from 'vitest';
import { findHeldModelOption, type ClioModelOption } from './model-options';

describe('findHeldModelOption (#1455)', () => {
  const row = (overrides: Partial<ClioModelOption>): ClioModelOption => ({
    providerId: 'claude_code',
    providerName: 'Claude Code',
    id: 'claude-sonnet-5',
    label: 'Sonnet 5',
    available: false,
    kind: 'model',
    health: 'needs_setup',
    ...overrides,
  });

  it('keeps a pick whose provider only waits on its sign-in', () => {
    expect(findHeldModelOption([row({})], 'claude_code', 'claude-sonnet-5')?.id).toBe(
      'claude-sonnet-5',
    );
  });

  it('keeps the pick from the provider row when a signed-out provider lists no models', () => {
    const held = findHeldModelOption(
      [row({ kind: 'provider', id: '', label: 'Claude Code' })],
      'claude_code',
      'claude-sonnet-5',
    );
    expect(held).toMatchObject({ kind: 'model', id: 'claude-sonnet-5', providerId: 'claude_code' });
  });

  it('never holds a failed provider or another provider', () => {
    expect(
      findHeldModelOption([row({ health: 'unavailable' })], 'claude_code', 'claude-sonnet-5'),
    ).toBeUndefined();
    expect(findHeldModelOption([row({})], 'codex', 'claude-sonnet-5')).toBeUndefined();
  });
});
