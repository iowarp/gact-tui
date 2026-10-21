import { describe, expect, it } from 'vitest';
import {
  canForkSession,
  isManagedChildSession,
  isSessionActive,
  isSessionRunning,
} from './session-state';

describe('session state semantics', () => {
  it('allows conversation forks and rejects managed sessions regardless of ancestry', () => {
    expect(canForkSession({ session_kind: 'conversation' })).toBe(true);
    expect(canForkSession({ session_kind: 'branch', parent_session_id: 'parent' })).toBe(true);
    expect(canForkSession({})).toBe(true);
    expect(canForkSession(undefined)).toBe(false);
    for (const session_kind of ['agent', 'lookup'] as const) {
      expect(canForkSession({ session_kind })).toBe(false);
      expect(canForkSession({ session_kind, parent_session_id: 'parent' })).toBe(false);
    }
    expect(canForkSession({ parent_session_id: 'parent' })).toBe(false);
  });
  it('gives user branches a composer while retaining the managed-child footer', () => {
    expect(isManagedChildSession({ parent_session_id: 'parent', session_kind: 'branch' })).toBe(
      false,
    );
    for (const session_kind of ['agent', 'lookup', 'unknown', undefined] as const) {
      expect(isManagedChildSession({ parent_session_id: 'parent', session_kind })).toBe(true);
    }
    expect(isManagedChildSession({})).toBe(false);
  });
  it('keeps response blockers active without presenting them as working', () => {
    expect(isSessionRunning('waiting_permission')).toBe(false);
    expect(isSessionRunning('waiting_user')).toBe(false);
    expect(isSessionActive('waiting_permission')).toBe(true);
    expect(isSessionActive('waiting_user')).toBe(true);
  });
});
