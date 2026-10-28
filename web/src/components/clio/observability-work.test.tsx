import type { Session } from '@clio/core/v3';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { ObservabilityWork } from './observability-work';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});
vi.mock('@/hooks/use-conversation-preview', () => ({
  useConversationPreview: () => ({ messages: [], outputs: [], pending: false }),
}));
// JSDOM has no graph measurements. Keep node interactions real here; the live
// browser suite separately checks the actual ReactFlow renderer and edge anchors.
vi.mock('@xyflow/react', () => ({
  Position: { Left: 'left', Right: 'right' },
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

describe('Gantt and Relationships switch', () => {
  it('preserves graph selection across the switch and links to an independent conversation', async () => {
    const content = (
      <MemoryRouter>
        <ObservabilityWork
          sessions={sessions}
          sessionId="root"
          artifacts={[]}
          messages={[]}
          processes={[]}
          runs={[]}
          subagents={[]}
          tools={[]}
        />
      </MemoryRouter>
    );
    const mounted = render(content);
    expect(screen.getByRole('region', { name: 'Conversation family Gantt' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Relationships' }));
    expect(screen.getByRole('region', { name: 'Conversation relationships' })).toBeVisible();
    fireEvent.click(await screen.findByRole('button', { name: 'Select Offset comparison' }));
    const inspector = screen.getByRole('complementary', { name: 'Selected conversation' });
    expect(within(inspector).getByRole('link', { name: 'Open conversation' })).toHaveAttribute(
      'href',
      '/workspaces/workspace/sessions/branch',
    );
    expect(inspector).toHaveTextContent('Independent conversation');
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Gantt' }));
    expect(
      screen.queryByRole('region', { name: 'Conversation relationships' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Relationships' }));
    expect(screen.getByRole('button', { name: 'Select Offset comparison' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Select Check residuals' }));
    expect(inspector).toHaveTextContent('Subagent (parent owned)');
    expect(screen.queryByRole('button', { name: /Branch from/ })).not.toBeInTheDocument();
    mounted.unmount();
    render(content);
    expect(screen.getByRole('button', { name: 'Switch to Gantt' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Select Check residuals' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
