import { createEntityState, type Session } from '@clio/core/v3';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useLiveStore } from '@/store/live-store';

const assignment = vi.fn((..._args: unknown[]) => ({ data: null as string | null }));
vi.mock('@/hooks/use-flow-run', () => ({
  useMessageAssignment: (...args: unknown[]) => assignment(...args),
}));

const { SessionOwnFlowRun } = await import('./session-own-flow-run');

afterEach(() => {
  cleanup();
  assignment.mockClear();
  useLiveStore.setState({ entities: createEntityState() });
});

function seed(metadata: Record<string, unknown>) {
  const entities = createEntityState();
  useLiveStore.setState({
    entities: {
      ...entities,
      sessions: { sess_1: { id: 'sess_1', metadata } as unknown as Session },
    },
  });
}

it('renders nothing and asks nothing in a conversation that runs no flow of its own', () => {
  seed({ agent_ref: 'clio/standard' });
  const { container } = render(<SessionOwnFlowRun messageId="msg_user_1" sessionId="sess_1" />);
  expect(container).toBeEmptyDOMElement();
  expect(assignment).not.toHaveBeenCalled();
});

it("finds the run of a session's own flow from the message that started it", () => {
  seed({ agent_flow: { id: 'deep-research', options: { max_rounds: 1 } } });
  const { container } = render(<SessionOwnFlowRun messageId="msg_user_1" sessionId="sess_1" />);
  expect(assignment).toHaveBeenCalledWith('sess_1', 'msg_user_1', true);
  expect(container).toBeEmptyDOMElement(); // until the assignment is confirmed
});
