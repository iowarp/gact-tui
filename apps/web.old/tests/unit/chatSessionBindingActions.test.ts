import { describe, expect, it, vi } from 'vitest';
import { createChatSessionBindingActions } from '../../src/routes/chatSessionBindingActions.js';

function makeActions(overrides: {
  activeId?: string;
  setSessionBlueprint?: ReturnType<typeof vi.fn>;
  setSessionExpertPack?: ReturnType<typeof vi.fn>;
} = {}) {
  const failToast = vi.fn();
  const refetchBindings = vi.fn();
  const setSessionBlueprint =
    overrides.setSessionBlueprint ?? vi.fn().mockResolvedValue(undefined);
  const setSessionExpertPack =
    overrides.setSessionExpertPack ?? vi.fn().mockResolvedValue(undefined);
  const actions = createChatSessionBindingActions({
    activeId: () => overrides.activeId ?? 's1',
    client: { setSessionBlueprint, setSessionExpertPack },
    failToast,
    refetchBindings,
  });
  return {
    actions,
    setSessionBlueprint,
    setSessionExpertPack,
    failToast,
    refetchBindings,
  };
}

describe('createChatSessionBindingActions', () => {
  it('binds a blueprint and refetches bindings', async () => {
    const h = makeActions();

    await h.actions.bindBlueprint('bp1');

    expect(h.setSessionBlueprint).toHaveBeenCalledWith('s1', { blueprint_id: 'bp1' });
    expect(h.refetchBindings).toHaveBeenCalledOnce();
  });

  it('binds an expert pack and refetches bindings', async () => {
    const h = makeActions();

    await h.actions.bindExpertPack('pack1');

    expect(h.setSessionExpertPack).toHaveBeenCalledWith('s1', { pack_id: 'pack1' });
    expect(h.refetchBindings).toHaveBeenCalledOnce();
  });

  it('does nothing without an active session', async () => {
    const h = makeActions({ activeId: '' });

    await h.actions.bindBlueprint('bp1');
    await h.actions.bindExpertPack('pack1');

    expect(h.setSessionBlueprint).not.toHaveBeenCalled();
    expect(h.setSessionExpertPack).not.toHaveBeenCalled();
    expect(h.refetchBindings).not.toHaveBeenCalled();
  });

  it('reports blueprint bind failures with retry callback', async () => {
    const error = new Error('denied');
    const h = makeActions({ setSessionBlueprint: vi.fn().mockRejectedValue(error) });

    await h.actions.bindBlueprint('bp1');

    expect(h.failToast).toHaveBeenCalledWith(
      'Could not bind blueprint',
      error,
      expect.any(Function),
    );
    expect(h.refetchBindings).not.toHaveBeenCalled();
  });

  it('reports expert-pack bind failures with retry callback', async () => {
    const error = new Error('denied');
    const h = makeActions({ setSessionExpertPack: vi.fn().mockRejectedValue(error) });

    await h.actions.bindExpertPack('pack1');

    expect(h.failToast).toHaveBeenCalledWith(
      'Could not bind expert pack',
      error,
      expect.any(Function),
    );
    expect(h.refetchBindings).not.toHaveBeenCalled();
  });
});
