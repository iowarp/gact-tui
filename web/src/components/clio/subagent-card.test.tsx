import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClioSubagentCard } from './subagent-card';

describe('ClioSubagentCard', () => {
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

  it('preserves the authoritative result without selecting a preferred paragraph', () => {
    render(
      <ClioSubagentCard
        subagent={{
          id: 'task_ndp',
          session_id: 'session_1',
          child_session_id: 'session_child',
          title: 'ndp #1',
          state: 'completed',
          task: 'Count candidate stations near Los Angeles.',
          result:
            'Starting catalog discovery.\n\n**Found 72 candidate GNSS stations** within 50 km of Los Angeles.\n\nNo station time-series CSV was staged, per the discovery-only request.',
        }}
      />,
    );

    expect(screen.getByText(/Starting catalog discovery/u)).toBeVisible();
    expect(screen.getByText(/Found 72 candidate GNSS stations/u)).toBeVisible();
    expect(screen.getByText(/No station time-series CSV was staged/u)).toBeVisible();
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
