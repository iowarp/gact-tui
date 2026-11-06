import type { ToolPresentationBlock } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@/components/ai-elements/markdown';
import { ReportTabs } from './report-tabs';
import { childReports } from '@/lib/child-reports';
import { ClioToolInvocation } from './tool-invocation';

// A returned result's reader can page a retained answer; no page is read here.
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => ({}) }));

afterEach(cleanup);

const REPORTS: ToolPresentationBlock[] = [
  {
    id: 'wait-task-0',
    type: 'text',
    label: 'task_a: Assignment complete',
    title: 'explore arc',
    model: 'claude-haiku-5-5',
    status: 'completed',
    text: 'ARC keeps the **live context plane**.',
  },
  {
    id: 'wait-task-1',
    type: 'text',
    label: 'task_b: Failed',
    title: 'explore plugins',
    status: 'failed',
    severity: 'error',
    text: 'The child ran out of steps.',
  },
  {
    id: 'wait-task-2',
    type: 'text',
    label: 'task_c',
    title: 'explore providers',
    status: 'pending',
    result_kind: 'snapshot',
    text: 'Pending when this call returned.',
  },
];

describe('report tabs', () => {
  it('names each child, says its status in words and shows its model and report', async () => {
    const user = userEvent.setup();
    render(<ReportTabs reports={REPORTS} />);
    expect(screen.getByRole('tab', { name: /explore arc.*Completed/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /explore plugins.*Failed/ })).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: /explore providers.*Still running/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('Ran on claude-haiku-5-5')).toBeInTheDocument();
    expect(await screen.findByText('live context plane')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /explore plugins/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('The child ran out of steps.');
  });

  it('selects only the per-child blocks of a wait', () => {
    const blocks: ToolPresentationBlock[] = [
      { id: 'wait-targets', type: 'text', text: 'task_a, task_b' },
      ...REPORTS,
    ];
    expect(childReports(blocks).map((block) => block.id)).toEqual([
      'wait-task-0',
      'wait-task-1',
      'wait-task-2',
    ]);
  });

  it('shows a wait with several returned reports as tabs in the tool row', async () => {
    const user = userEvent.setup();
    render(
      <ClioToolInvocation
        compact
        tool={{
          id: 'wait',
          session_id: 's',
          name: 'wait_tasks',
          state: 'succeeded',
          input: { tasks: ['task_a', 'task_b'], return_when: 'all' },
          presentation: {
            action: 'Wait',
            subject: 'wait-targets',
            summary: '2 results collected',
            blocks: [
              { id: 'wait-targets', type: 'text', text: 'task_a, task_b' },
              { ...REPORTS[0]!, result_kind: 'completion' },
              { ...REPORTS[1]!, result_kind: 'completion' },
            ],
          },
        }}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Show result for/ }));
    // The shared returned-result reader: one tab per child, named; an unsuccessful child
    // says its status in words, a completed one stays quiet.
    expect(screen.getByRole('tablist', { name: 'Returned task results' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByRole('tab', { name: 'explore arc' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /explore plugins.*Failed/ })).toBeInTheDocument();
    expect(screen.getByText('Ran on claude-haiku-5-5')).toBeInTheDocument();
  });
});
