import { describe, expect, it } from 'vitest';
import { isSessionActive, isSessionRunning } from './session-state';

describe('session state semantics', () => {
  it('keeps response blockers active without presenting them as working', () => {
    expect(isSessionRunning('waiting_permission')).toBe(false);
    expect(isSessionRunning('waiting_user')).toBe(false);
    expect(isSessionActive('waiting_permission')).toBe(true);
    expect(isSessionActive('waiting_user')).toBe(true);
  });
});
