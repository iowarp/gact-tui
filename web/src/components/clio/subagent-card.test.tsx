import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioSubagentCard, ClioSubagentLifecycleLine } from './subagent-card';

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
    expect(onOpen).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'task_geo' }),
      'conversation',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open child conversation geospatial #1' }), {
      shiftKey: true,
    });
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'task_geo' }), 'canvas');
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
    id: 'task_geo',
    session_id: 'session_1',
    child_session_id: 'session_child',
    agent_id: 'researcher',
    title: 'researcher #1',
    state: 'completed' as const,
    task: 'Find the primary source for the HDF5 origin chronology.',
    result: 'The HDF Group history establishes the original project timeline.',
    duration_ms: 12_500,
  };

  it('shows only the assignment at the launch position', () => {
    render(<ClioSubagentLifecycleLine stage="delegate.started" subagent={child} />);

    expect(screen.getByText('started')).toBeVisible();
    expect(screen.getByText(child.task)).toBeVisible();
    expect(screen.queryByText(child.result)).not.toBeInTheDocument();
  });

  it('shows only the result when the child returns and remains navigable', () => {
    const onOpen = vi.fn();
    render(
      <ClioSubagentLifecycleLine onOpen={onOpen} stage="delegate.completed" subagent={child} />,
    );

    expect(screen.getByText('returned')).toBeVisible();
    expect(screen.getByText(child.result)).toBeVisible();
    expect(screen.queryByText(child.task)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open child conversation researcher #1' }));
    expect(onOpen).toHaveBeenCalledWith(child, 'conversation');
  });
});
