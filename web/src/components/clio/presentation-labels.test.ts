import { describe, expect, it } from 'vitest';
import { humanizeProtocolValue } from './presentation-labels';

describe('humanizeProtocolValue', () => {
  it('turns wire identifiers into readable labels', () => {
    expect(humanizeProtocolValue('waiting_permission')).toBe('Waiting permission');
    expect(humanizeProtocolValue('provider.transportError')).toBe('Provider transport Error');
    expect(humanizeProtocolValue('')).toBe('Unknown');
  });
});
