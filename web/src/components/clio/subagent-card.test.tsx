import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClioSubagentCard } from './subagent-card';

describe('ClioSubagentCard', () => {
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
    expect(screen.getByRole('button', { name: 'Open conversation' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open in canvas' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Open child conversation geospatial #1' }));
    expect(onOpen).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'task_geo' }),
      'conversation',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open child conversation geospatial #1' }), {
      shiftKey: true,
    });
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'task_geo' }), 'canvas');

    fireEvent.click(screen.getByRole('button', { name: 'Open in canvas' }));
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'task_geo' }), 'canvas');
  });
});
