import type { AsyncProcess } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { RailRuns, type RailRunsProps } from './rail-runs';

afterEach(cleanup);

const task = (id: string, status: string, extra: Partial<AsyncProcess> = {}): AsyncProcess => ({
  id,
  kind: 'mcp-task',
  title: id,
  live_state: status as AsyncProcess['live_state'],
  status,
  metadata: {},
  ...extra,
});
const exporting = task('Export stations', 'running', { supported_actions: ['cancel'] });
const broken = task('Merge catalog', 'failed', { supported_actions: ['restart'] });
const flow = task('Research', 'running', { flow: { id: 'deep-research', status: 'running' } });

function renderRuns(props: Partial<RailRunsProps> = {}) {
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <RailRuns processes={[exporting, broken, flow]} subagents={[]} {...props} />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

it('stops a run from Delete only after asking, and lists only what is running', async () => {
  const user = userEvent.setup();
  const onCancelTask = vi.fn().mockResolvedValue(undefined);
  renderRuns({ onCancelTask });

  screen.getByRole('button', { name: 'Export stations' }).focus();
  await user.keyboard('{Delete}');
  expect(screen.getByRole('alertdialog', { name: 'Stop this run?' })).toBeVisible();
  expect(onCancelTask).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Keep running' }));
  expect(onCancelTask).not.toHaveBeenCalled();
  screen.getByRole('button', { name: 'Export stations' }).focus();
  await user.keyboard('{Delete}');
  await user.click(screen.getByRole('button', { name: 'Stop run' }));
  expect(onCancelTask).toHaveBeenCalledWith(exporting);

  // A failed run has left Running; its record in Runs offers Retry.
  expect(screen.queryByRole('button', { name: 'Merge catalog' })).not.toBeInTheDocument();
});

it('opens a flow run as a tab and any other run as its record', async () => {
  const user = userEvent.setup();
  const onOpenFlow = vi.fn();
  const onOpenRun = vi.fn();
  renderRuns({ onOpenFlow, onOpenRun });
  // The row and its tab are named by the task; the flow is how it opens.
  await user.click(screen.getByRole('button', { name: /^Research$/iu }));
  expect(onOpenFlow).toHaveBeenCalledWith('Research', 'Research');
  await user.click(screen.getByRole('button', { name: /^Export stations$/iu }));
  expect(onOpenRun).toHaveBeenCalledWith('Export stations', 'Export stations', undefined);
  expect(screen.queryByRole('link', { name: 'All runs' })).not.toBeInTheDocument();
});

it('says when nothing is running', () => {
  renderRuns({
    processes: [],
    subagents: [
      {
        id: 'child',
        session_id: 'session',
        title: 'QC soil_sites.csv',
        state: 'completed',
        duration_ms: 40 * 60_000,
      },
    ],
  });
  expect(screen.getByText('Nothing is running')).toBeVisible();
});

it('reports a stop the server refused, naming the run', async () => {
  const user = userEvent.setup();
  renderRuns({ onCancelTask: vi.fn().mockRejectedValue(new Error('Task already finished')) });
  await user.click(screen.getByRole('button', { name: 'Stop Export stations' }));
  await user.click(screen.getByRole('button', { name: 'Stop run' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not stop Export stations: Task already finished',
  );
});
