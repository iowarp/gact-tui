import { createEntityState, type Message, type ToolInvocation } from '@clio/core/v3';
import { expect, it } from 'vitest';
import { withoutSessionData } from './session-entity-retention';

it('releases expired bodies/watermarks while keeping other sessions and referenced entities', () => {
  const state = createEntityState();
  state.messages.old = {
    id: 'old',
    session_id: 'old-session',
    role: 'assistant',
    created_at: '',
    blocks: [],
  };
  state.messages.current = {
    id: 'current',
    session_id: 'current-session',
    role: 'assistant',
    created_at: '',
    blocks: [{ type: 'tool', tool_id: 'shared' }] as unknown as Message['blocks'],
  };
  state.tools.unused = { id: 'unused', session_id: 'old-session' } as ToolInvocation;
  state.tools.shared = { id: 'shared', session_id: 'old-session' } as ToolInvocation;
  state.revisions = { old: 3, unused: 4, shared: 5, current: 6 };
  const next = withoutSessionData(state, 'old-session');
  expect(next.messages.old).toBeUndefined();
  expect(next.tools.unused).toBeUndefined();
  expect(next.messages.current).toBe(state.messages.current);
  expect(next.tools.shared).toBe(state.tools.shared);
  expect(next.revisions).toEqual({ shared: 5, current: 6 });
  expect(state.messages.old).toBeDefined();
});
