import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ClioSubagentCard,
  ClioSubagentLifecycleLine,
  ClioSubagentProgressLine,
} from './subagent-card';
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

    expect(screen.getByText('Unknown')).toBeVisible();
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
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

    expect(screen.getByText('claude-haiku-5-5')).toBeVisible();
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

    expect(screen.getByText('Interrupted')).toBeVisible();
    expect(screen.queryByText('Failed')).not.toBeInTheDocument();
  });

  it('treats an event-order gap as connecting instead of a failed child', () => {
    render(<ClioSubagentCard />);

    expect(screen.getByText('Connecting child agent')).toBeVisible();
    expect(screen.getByText('Waiting for the live child record.')).toBeVisible();
    expect(screen.queryByText('Child agent unavailable')).not.toBeInTheDocument();
  });

  it('shows authoritative child-agent work without another disclosure layer', () => {
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

    expect(screen.getByText('Ground the requested region before catalog search.')).toBeVisible();
    expect(screen.getByText('Resolved the region with authoritative coordinates.')).toBeVisible();
    expect(screen.queryByText('Open conversation')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open child conversation geospatial #1' }));
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'task_geo' }), 'canvas');

    fireEvent.click(screen.getByRole('button', { name: 'Open child conversation geospatial #1' }), {
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

  it('names the agent and keeps its assignment in the normal tool disclosure', () => {
    const onOpen = show('delegate.started');
    expect(screen.getByText('researcher')).toBeVisible();
    expect(screen.getByText('Accepted')).toBeVisible();
    expect(screen.queryByText(child.task)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show result for Delegate' }));
    expect(screen.getByText(child.task)).toBeVisible();
    expect(screen.queryByText(child.result)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open child conversation' }));
    expect(onOpen).toHaveBeenCalledWith(child, 'canvas');
  });

  it('shows a return as a turn ending without claiming the assignment succeeded', () => {
    show('delegate.completed');
    expect(screen.getByText('Turn ended')).toBeVisible();
    expect(screen.queryByText(child.result)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show result for Subagent result' }));
    expect(screen.getByText(child.result)).toBeVisible();
  });

  it('keeps continuations distinct from returned results', () => {
    show('delegate.superseded');
    expect(screen.getByRole('button', { name: 'Show result for Continue subagent' })).toBeVisible();
    expect(screen.queryByText('Turn ended')).not.toBeInTheDocument();
  });
});

describe('ClioSubagentProgressLine', () => {
  it('keeps running work visible and opens the actual child conversation', () => {
    const child = {
      id: 'audit',
      session_id: 'parent',
      child_session_id: 'child',
      agent_id: 'main',
      title: 'A long assignment that stays in the tool details',
      state: 'running' as const,
    };
    const onOpen = vi.fn();
    render(<ClioSubagentProgressLine subagent={child} onOpen={onOpen} />);
    expect(screen.getByText('main')).toBeVisible();
    expect(screen.getByText('Running')).toBeVisible();
    expect(screen.getByText(child.title)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Open subagent main' }));
    expect(onOpen).toHaveBeenLastCalledWith(child, 'canvas');
    fireEvent.click(screen.getByRole('button', { name: 'Open subagent main' }), { shiftKey: true });
    expect(onOpen).toHaveBeenLastCalledWith(child, 'conversation');
  });
});
