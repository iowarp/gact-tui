import { describe, expect, it } from 'vitest';
import {
  isFreshBump,
  normalizedSessionTitle,
  sessionStatusPipClass,
  shouldCommitRename,
} from '../../src/components/SessionListItemModel.js';

describe('SessionListItemModel', () => {
  it('classifies recently bumped rows using a two-second window', () => {
    expect(isFreshBump(undefined, 10_000)).toBe(false);
    expect(isFreshBump(8_001, 10_000)).toBe(true);
    expect(isFreshBump(8_000, 10_000)).toBe(false);
  });

  it('maps session statuses to sidebar pip classes', () => {
    expect(sessionStatusPipClass('running')).toBe('running');
    expect(sessionStatusPipClass('waiting_permission')).toBe('waiting');
    expect(sessionStatusPipClass('error')).toBe('error');
    expect(sessionStatusPipClass('finished')).toBe('finished');
    expect(sessionStatusPipClass('idle')).toBe('idle');
  });

  it('normalizes row title display without changing real titles', () => {
    expect(normalizedSessionTitle('  ')).toBe('Untitled session');
    expect(normalizedSessionTitle('  EarthScope run  ')).toBe('EarthScope run');
  });

  it('only commits meaningful title edits', () => {
    expect(shouldCommitRename('  ', 'Old title')).toBeNull();
    expect(shouldCommitRename('Old title', 'Old title')).toBeNull();
    expect(shouldCommitRename('  New title  ', 'Old title')).toBe('New title');
  });
});
