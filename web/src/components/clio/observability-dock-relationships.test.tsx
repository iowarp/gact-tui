import type { Session } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { ClioObservabilityView } from './observability-dock';

vi.mock('@/hooks/use-conversation-preview', () => ({
  useConversationPreview: () => ({ messages: [], outputs: [], pending: false }),
}));
// JSDOM has no graph measurements. Keep node interactions real here; the live
// browser suite separately checks the actual ReactFlow renderer and edge anchors.
vi.mock('@xyflow/react', () => ({
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
  MarkerType: { ArrowClosed: 'closed' },
  Handle: () => null,
  Background: () => null,
  Controls: () => null,
  useReactFlow: () => ({ fitView: () => undefined }),
  ReactFlow: ({
    nodes,
    nodeTypes,
    children,
  }: {
    nodes: { id: string; data: unknown; type: string }[];
    nodeTypes: Record<string, (props: { data: unknown }) => ReactNode>;
    children: ReactNode;
  }) => (
    <div>
      {nodes.map((node) => (
        <div key={node.id}>{nodeTypes[node.type]!({ data: node.data })}</div>
      ))}
      {children}
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const sessions = [
  { id: 'root', title: 'Calibration baseline', session_kind: 'conversation' },
  { id: 'branch', title: 'Offset comparison', parent_session_id: 'root', session_kind: 'branch' },
  { id: 'agent', title: 'Check residuals', parent_session_id: 'root', session_kind: 'agent' },
].map(
  (session) =>
    ({
      ...session,
      workspace_id: 'workspace',
      state: 'completed',
      created_at: '2026-10-11',
    }) as Session,
);

it('shows the conversation family graph for a session with a fork child', async () => {
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ClioObservabilityView
          artifacts={[]}
          contextFiles={[]}
          contextFrames={[]}
          diffs={[]}
          messages={[]}
          processes={[]}
          runs={[]}
          sessionId="root"
          sessions={sessions}
          subagents={[]}
          tasks={[]}
          tools={[]}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const views = screen.getByRole('tablist', { name: 'Observability view' });
  expect(
    within(views)
      .getAllByRole('tab')
      .map((tab) => tab.textContent),
  ).toEqual(['Timeline', 'Relationships', 'Context']);
  await user.click(within(views).getByRole('tab', { name: 'Relationships' }));
  // The relationships graph is its own chunk, so it arrives a tick later.
  expect(await screen.findByRole('region', { name: 'Conversation relationships' })).toBeVisible();
  expect(screen.queryByRole('button', { name: /Switch to Gantt/u })).not.toBeInTheDocument();
  await user.click(await screen.findByRole('button', { name: 'Select Offset comparison' }));
  const inspector = screen.getByRole('complementary', { name: 'Selected conversation' });
  expect(within(inspector).getByRole('link', { name: 'Open conversation' })).toHaveAttribute(
    'href',
    '/workspaces/workspace/sessions/branch',
  );
  expect(inspector).toHaveTextContent('Independent conversation');

  await user.click(within(views).getByRole('tab', { name: 'Timeline' }));
  expect(
    screen.queryByRole('region', { name: 'Conversation relationships' }),
  ).not.toBeInTheDocument();
  await user.click(within(views).getByRole('tab', { name: 'Relationships' }));
  expect(await screen.findByRole('button', { name: 'Select Offset comparison' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await user.click(screen.getByRole('button', { name: 'Select Check residuals' }));
  expect(screen.getByRole('complementary', { name: 'Selected conversation' })).toHaveTextContent(
    'Subagent (parent owned)',
  );
});
