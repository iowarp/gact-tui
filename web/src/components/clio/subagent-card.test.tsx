import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioSubagentCard, ClioSubagentLifecycleLine } from './subagent-card';
import { PresentationNavigation } from './presentation-navigation';

afterEach(cleanup);

describe('ClioSubagentCard', () => {
  it('reports an unrecognized child state as unknown instead of completed', () => {
    render(
      <ClioSubagentCard
        subagent={{
          id: 'task_relay',
          session_id: 'session_1',
          agent_id: 'relay',
          title: 'relay #1',
          state: 'unknown',
          task: 'Run the remote job.',
        }}
      />,
    );

    expect(screen.getByRole('img', { name: 'Unknown' })).toBeInTheDocument();
    expect(screen.getByText('unknown')).toBeVisible();
    expect(screen.queryByRole('img', { name: 'Completed' })).not.toBeInTheDocument();
  });

  it('names the model a child runs on beside its name', () => {
    render(
      <ClioSubagentCard
        subagent={{
          id: 'task_small',
          session_id: 'session_1',
          agent_id: 'reviewer',
          title: 'reviewer #1',
          state: 'running',
          task: 'Review the draft.',
          model_choice: {
            asked: 'claude_code/claude-haiku-5-5',
            ran: { provider_id: 'claude_code', model_id: 'claude-haiku-5-5' },
            source: 'explicit',
            reasons: [],
            effort: '',
          },
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Technical details for Delegate' }));
    expect(within(screen.getByRole('dialog')).getByText('claude-haiku-5-5')).toBeVisible();
  });

  it('keeps an interrupted child interrupted instead of relabeling it failed', () => {
    render(
      <ClioSubagentCard
        subagent={{
          id: 'task_stopped',
          session_id: 'session_1',
          agent_id: 'geospatial',
          title: 'geospatial #2',
          state: 'interrupted',
          task: 'Ground the requested region.',
        }}
      />,
    );

    expect(screen.getByRole('img', { name: 'Interrupted' })).toBeInTheDocument();
    expect(screen.getByText('interrupted')).toBeVisible();
    expect(screen.queryByRole('img', { name: 'Failed' })).not.toBeInTheDocument();
    expect(screen.queryByText('failed')).not.toBeInTheDocument();
  });

  it('treats an event-order gap as connecting instead of a failed child', () => {
    render(<ClioSubagentCard />);

    expect(screen.getByText('Connecting child agent')).toBeVisible();
    expect(screen.getByText('Waiting for the live child record.')).toBeVisible();
    expect(screen.queryByText('Child agent unavailable')).not.toBeInTheDocument();
  });

  it('reads as one delegate row whose body holds the returned result', () => {
    const onOpen = vi.fn();
    render(
      <ClioSubagentCard
        onOpen={onOpen}
        subagent={{
          id: 'task_geo',
          session_id: 'session_1',
          child_session_id: 'session_child',
          agent_id: 'geospatial',
          title: 'geospatial #1',
          state: 'completed',
          summary: 'main <- geospatial',
          task: 'Ground the requested region before catalog search.',
          result: 'Resolved the region with authoritative coordinates.',
          duration_ms: 12_500,
        }}
      />,
    );

    expect(screen.getByText('Delegate')).toBeVisible();
    expect(screen.getByText('Ground the requested region before catalog search.')).toBeVisible();
    expect(
      screen.queryByText('Resolved the region with authoritative coordinates.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Open conversation')).not.toBeInTheDocument();
    expect(screen.queryByText('main', { exact: true })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Expand Delegate' }));
    expect(screen.getByText('Resolved the region with authoritative coordinates.')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Open geospatial' }));
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'task_geo' }), 'canvas');

    fireEvent.click(screen.getByRole('button', { name: 'Open geospatial' }), {
      shiftKey: true,
    });
    expect(onOpen).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'task_geo' }),
      'conversation',
    );
  });

  it('does not reinterpret persisted routing syntax', () => {
    render(
      <ClioSubagentCard
        subagent={{
          id: 'task_geo',
          session_id: 'session_1',
          agent_id: 'geospatial',
          title: 'geospatial #1',
          state: 'completed',
          summary: 'main <- geospatial',
        }}
      />,
    );

    expect(screen.getByText('main <- geospatial')).toBeVisible();
  });
});

describe('ClioSubagentLifecycleLine', () => {
  const child = {
    id: 'task_audit',
    session_id: 'parent',
    child_session_id: 'child',
    agent_id: 'researcher',
    title: 'An assignment that should stay in the details',
    state: 'completed' as const,
    task: 'Inspect the supplied source files.',
    result: 'The audit returned its findings.',
    duration_ms: 12_500,
  };

  function show(
    stage: 'delegate.started' | 'delegate.completed' | 'delegate.superseded',
    run = child,
  ) {
    const onOpen = vi.fn();
    render(
      <PresentationNavigation.Provider
        value={{ artifacts: {}, subagents: { [run.id]: run }, onOpenSubagent: onOpen }}
      >
        <ClioSubagentLifecycleLine stage={stage} subagent={run} />
      </PresentationNavigation.Provider>,
    );
    return onOpen;
  }

  it('names the agent as a link with its assignment as the argument', () => {
    const onOpen = show('delegate.started');
    expect(screen.getByText('Delegate')).toBeVisible();
    expect(screen.getByText('researcher')).toBeVisible();
    // The mark carries the outcome; the row repeats no status recap.
    expect(screen.getByRole('img', { name: 'Completed' })).toBeInTheDocument();
    expect(screen.queryByText('completed')).not.toBeInTheDocument();
    expect(screen.getByText(child.task)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Expand Delegate' }));
    expect(screen.getByRole('region', { name: 'Delegate researcher' })).toHaveTextContent(
      child.task,
    );
    expect(screen.queryByText(child.result)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open researcher' }));
    expect(onOpen).toHaveBeenCalledWith(child, 'canvas');
  });

  it('shows a return as a turn ending without claiming the assignment succeeded', () => {
    show('delegate.completed');
    expect(screen.getByText('Subagent turn ended')).toBeVisible();
    expect(screen.queryByText(child.result)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expand Subagent turn ended' }));
    expect(screen.getByText(child.result)).toBeVisible();
  });

  it('keeps continuations distinct from returned results', () => {
    show('delegate.superseded');
    expect(screen.getByRole('button', { name: 'Expand Continue subagent' })).toBeVisible();
    expect(screen.queryByText(/turn ended/i)).not.toBeInTheDocument();
  });
});
