import { createSignal } from 'solid-js';
import type { PermissionRequest, UserQuestion } from '@clio/core';
import { describe, expect, it } from 'vitest';
import { createLivePendingInteractionsHandle } from '../../src/LivePendingInteractionsHandle.js';

function createHarness() {
  const [pendingPermission, setPendingPermission] = createSignal<PermissionRequest | null>(
    { id: 'perm-1' } as PermissionRequest,
  );
  const [pendingQuestion, setPendingQuestion] = createSignal<UserQuestion | null>(
    { id: 'q-1' } as UserQuestion,
  );
  const handle = createLivePendingInteractionsHandle({
    pendingPermission,
    setPendingPermission,
    pendingQuestion,
    setPendingQuestion,
  });
  return { handle, pendingPermission, pendingQuestion };
}

describe('createLivePendingInteractionsHandle', () => {
  it('exposes the underlying pending signals', () => {
    const { handle } = createHarness();
    expect(handle.pendingPermission()?.id).toBe('perm-1');
    expect(handle.pendingQuestion()?.id).toBe('q-1');
  });

  it('clear() drops both pending interactions', () => {
    const { handle } = createHarness();
    handle.clear();
    expect(handle.pendingPermission()).toBeNull();
    expect(handle.pendingQuestion()).toBeNull();
  });

  it('clearPendingPermission() clears only the permission, leaving the question', () => {
    const { handle } = createHarness();
    handle.clearPendingPermission();
    expect(handle.pendingPermission()).toBeNull();
    expect(handle.pendingQuestion()?.id).toBe('q-1');
  });

  it('reconcileFromSnapshot() folds explicit pending fields and ignores messages', () => {
    const { handle } = createHarness();
    handle.reconcileFromSnapshot({
      messages: [{ id: 'm-1', role: 'user', parts: [] }],
      pendingPermission: { id: 'perm-2' } as PermissionRequest,
      pendingQuestion: null,
    });
    expect(handle.pendingPermission()?.id).toBe('perm-2');
    expect(handle.pendingQuestion()).toBeNull();
  });

  it('reconcileFromSnapshot() leaves pending fields untouched when absent', () => {
    const { handle } = createHarness();
    handle.reconcileFromSnapshot({ messages: [] });
    expect(handle.pendingPermission()?.id).toBe('perm-1');
    expect(handle.pendingQuestion()?.id).toBe('q-1');
  });

  describe('guarded setPendingPermission (single-owner coordination)', () => {
    it('rejects a stale re-request for an already-resolved permission', () => {
      const { handle } = createHarness();
      // Resolve perm-1 (e.g. permission.resolved on the SSE stream).
      handle.setPendingPermission(null);
      expect(handle.pendingPermission()).toBeNull();
      // A late, out-of-order `permission.requested` for the SAME id arrives
      // (no ordering guarantee across the 3 caller modules). It must NOT
      // re-open the settled card.
      handle.setPendingPermission({ id: 'perm-1' } as PermissionRequest);
      expect(handle.pendingPermission()).toBeNull();
    });

    it('still accepts a genuinely new permission after a resolve', () => {
      const { handle } = createHarness();
      handle.setPendingPermission(null);
      handle.setPendingPermission({ id: 'perm-2' } as PermissionRequest);
      expect(handle.pendingPermission()?.id).toBe('perm-2');
    });

    it('preserves in-order requested -> resolved behaviour', () => {
      const { handle } = createHarness();
      handle.setPendingPermission({ id: 'perm-3' } as PermissionRequest);
      expect(handle.pendingPermission()?.id).toBe('perm-3');
      handle.setPendingPermission(null);
      expect(handle.pendingPermission()).toBeNull();
    });

    it('a clear of a fresh card supersedes the prior resolved id', () => {
      const { handle } = createHarness();
      // perm-1 resolved, perm-2 requested and shown, then perm-2 resolved.
      handle.setPendingPermission(null);
      handle.setPendingPermission({ id: 'perm-2' } as PermissionRequest);
      handle.setPendingPermission(null);
      expect(handle.pendingPermission()).toBeNull();
      // A stale re-request of the OLD perm-1 is still rejected only if it is
      // the latest resolved id; perm-2 is now the latest, so perm-1 (older,
      // never re-set) re-requesting is treated as a fresh cycle.
      handle.setPendingPermission({ id: 'perm-1' } as PermissionRequest);
      expect(handle.pendingPermission()?.id).toBe('perm-1');
      // But a re-request of the just-resolved perm-2 is rejected.
      handle.setPendingPermission(null);
      handle.setPendingPermission({ id: 'perm-1' } as PermissionRequest);
      handle.setPendingPermission(null);
      handle.setPendingPermission({ id: 'perm-1' } as PermissionRequest);
      expect(handle.pendingPermission()).toBeNull();
    });
  });
});
