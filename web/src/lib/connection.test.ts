import { describe, expect, it } from 'vitest';
import { normalizeEndpoint } from './connection';

describe('connection addresses', () => {
  it('normalizes a supported service address', () => {
    expect(normalizeEndpoint('http://agent.local/')).toBe('http://agent.local');
  });

  it('keeps credentials out of remembered connection addresses', () => {
    expect(() => normalizeEndpoint('https://token@agent.local')).toThrow(
      'Put access tokens in Advanced settings',
    );
  });
});
