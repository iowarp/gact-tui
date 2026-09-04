import type { ApprovalRequest, PendingInteraction, Session, UserQuestion } from '@clio/core/v3';
import { describe, expect, it, vi } from 'vitest';
import {
  hasUnifiedInteractionCapability,
  interactionRootSessionId,
  legacyPendingInteractions,
  respondToLegacyInteraction,
} from './pending-interaction-contract';

const root: Session = {
  id: 'sess_root',
  workspace_id: 'ws_1',
  title: 'Root task',
  state: 'running',
  created_at: '2026-09-02T00:00:00Z',
  updated_at: '2026-09-02T00:00:00Z',
  mode: 'edit',
  edit_mode: 'diff',
  routing_mode: 'auto',
  approval_mode: 'ask',
  pinned: false,
  archived: false,
};
const child: Session = {
  ...root,
  id: 'sess_child',
  parent_session_id: root.id,
  title: 'Child task',
};

describe('pending interaction legacy compatibility', () => {
  it('uses the normalized route only when the backend advertises it', () => {
    expect(hasUnifiedInteractionCapability({ x_clio_interactions: true })).toBe(true);
    expect(hasUnifiedInteractionCapability({})).toBe(false);
    expect(hasUnifiedInteractionCapability()).toBe(false);
  });

  it('projects legacy child records with root attendance and exact owner fields', () => {
    const approval = {
      id: 'perm_1',
      session_id: child.id,
      tool_name: 'shell.exec',
      summary: 'Run command',
      status: 'pending',
      created_at: '2026-09-02T00:00:00Z',
    } satisfies ApprovalRequest;
    const question = {
      id: 'q1',
      session_id: child.id,
      prompt: 'Choose one',
      status: 'pending',
      kind: 'choice',
      options: [{ label: 'One', value: 'one' }],
      created_at: '2026-09-02T00:00:00Z',
      updated_at: '2026-09-02T00:00:00Z',
    } satisfies UserQuestion;

    expect(interactionRootSessionId(child.id, [root, child])).toEqual({
      id: root.id,
      resolved: true,
    });
    expect(legacyPendingInteractions([root, child], [approval], [question])).toMatchObject([
      {
        id: 'perm_1',
        kind: 'permission',
        owner_session_id: child.id,
        attended_session_id: root.id,
      },
      {
        id: 'q1',
        kind: 'question',
        owner_session_id: child.id,
        attended_session_id: root.id,
      },
    ]);
  });

  it('marks the root unresolved when an ancestor is known only by id', () => {
    // "grandchild"'s parent (a middle session) is not in the locally known
    // list at all — the walk can reach no further than "grandchild" itself,
    // and must not silently report that as a confirmed root.
    const grandchild: Session = {
      ...root,
      id: 'sess_grandchild',
      parent_session_id: 'sess_missing_middle',
      title: 'Grandchild task',
    };

    expect(interactionRootSessionId(grandchild.id, [root, grandchild])).toEqual({
      id: grandchild.id,
      resolved: false,
    });
  });

  it('marks the root unresolved rather than looping on a cyclic hierarchy', () => {
    const cyclicA: Session = { ...root, id: 'sess_a', parent_session_id: 'sess_b' };
    const cyclicB: Session = { ...root, id: 'sess_b', parent_session_id: 'sess_a' };

    expect(interactionRootSessionId(cyclicA.id, [cyclicA, cyclicB])).toEqual({
      id: cyclicA.id,
      resolved: false,
    });
  });

  it('resolves a genuine root (no parent) as resolved, not a walk failure', () => {
    expect(interactionRootSessionId(root.id, [root, child])).toEqual({
      id: root.id,
      resolved: true,
    });
  });

  it('routes normalized question payloads to the exact legacy child destination', async () => {
    const interaction: PendingInteraction = {
      id: 'question:q1',
      kind: 'question',
      owner_session_id: child.id,
      attended_session_id: root.id,
      status: 'pending',
      title: 'Question',
      source: { protocol: 'native' },
      created_at: '2026-09-02T00:00:00Z',
      payload: { question_id: 'q1' },
    };
    const legacy = {
      answerQuestion: vi.fn(async () => undefined),
      cancelQuestion: vi.fn(async () => undefined),
      respondPermission: vi.fn(async () => undefined),
      a2uiAction: vi.fn(async () => undefined),
    };

    await respondToLegacyInteraction(
      interaction,
      { action: 'answer', answer: 'Context', selected_options: ['one'] },
      legacy,
    );

    expect(legacy.answerQuestion).toHaveBeenCalledWith(child.id, 'q1', {
      answer: 'Context',
      selected_options: ['one'],
    });
  });

  it('rejects an unsupported permission action instead of casting it through', async () => {
    const interaction: PendingInteraction = {
      id: 'permission:p1',
      kind: 'permission',
      owner_session_id: child.id,
      attended_session_id: root.id,
      status: 'pending',
      title: 'Run the command',
      source: { protocol: 'native' },
      created_at: '2026-09-02T00:00:00Z',
      payload: { permission_id: 'perm_1' },
    };
    const legacy = {
      answerQuestion: vi.fn(async () => undefined),
      cancelQuestion: vi.fn(async () => undefined),
      respondPermission: vi.fn(async () => undefined),
      a2uiAction: vi.fn(async () => undefined),
    };

    await expect(
      respondToLegacyInteraction(interaction, { action: 'allow_forever' }, legacy),
    ).rejects.toThrow('Unsupported permission action: allow_forever');
    expect(legacy.respondPermission).not.toHaveBeenCalled();
  });
});
