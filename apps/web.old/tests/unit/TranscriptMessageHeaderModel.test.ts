import { describe, expect, it } from 'vitest';
import {
  absoluteMessageTime,
  relativeMessageTime,
  transcriptRoleIcon,
  transcriptRoleLabel,
} from '../../src/components/TranscriptMessageHeaderModel.js';

describe('TranscriptMessageHeaderModel', () => {
  it('maps known and unknown roles to display labels/icons', () => {
    expect(transcriptRoleIcon('user')).toBe('user');
    expect(transcriptRoleIcon('assistant')).toBe('bot');
    expect(transcriptRoleIcon('unknown')).toBe('circle');
    expect(transcriptRoleLabel('user')).toBe('You');
    expect(transcriptRoleLabel('unknown')).toBe('unknown');
  });

  it('formats relative times with stable thresholds', () => {
    const now = Date.parse('2026-06-22T12:00:00.000Z');

    expect(relativeMessageTime('2026-06-22T11:59:45.000Z', now)).toBe('just now');
    expect(relativeMessageTime('2026-06-22T11:43:00.000Z', now)).toBe('17m');
    expect(relativeMessageTime('2026-06-22T09:00:00.000Z', now)).toBe('3h');
    expect(relativeMessageTime('2026-06-19T12:00:00.000Z', now)).toBe('3d');
  });

  it('passes invalid timestamps through unchanged', () => {
    expect(relativeMessageTime('not-a-date', 0)).toBe('not-a-date');
    expect(absoluteMessageTime('not-a-date')).toBe('not-a-date');
  });
});
