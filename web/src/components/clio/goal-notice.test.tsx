import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { TranscriptNotice } from './conversation-summarization';
import { PresentationNavigation } from './presentation-navigation';

afterEach(cleanup);

it('opens Work in one click or keyboard activation from a typed Goal receipt', async () => {
  const open = vi.fn();
  render(
    <PresentationNavigation.Provider value={{ artifacts: {}, subagents: {}, onOpenWork: open }}>
      <TranscriptNotice
        block={{
          id: 'goal',
          type: 'notice',
          source: 'goal',
          code: 'goal_started',
          text: 'Finish the report',
        }}
      />
    </PresentationNavigation.Provider>,
  );
  const entry = screen.getByRole('button', { name: 'Goal started. Open Work' });
  expect(entry).toHaveTextContent('Finish the report');
  expect(entry.querySelector('[data-slot="goal-icon"]')).not.toBeNull();
  expect(screen.queryByText(/\[\/goal\]/u)).toBeNull();
  const user = userEvent.setup();
  await user.click(entry);
  expect(open).toHaveBeenCalledTimes(1);
  entry.focus();
  await user.keyboard('{Enter}');
  expect(open).toHaveBeenCalledTimes(2);
});

it('keeps a retained Goal receipt readable when viewing an archive without navigation', () => {
  render(
    <TranscriptNotice
      block={{
        id: 'goal',
        type: 'notice',
        source: 'goal',
        code: 'goal_stopped',
        text: 'Finish the report',
      }}
    />,
  );
  expect(screen.getByText('Goal stopped')).toBeVisible();
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.queryByText('Open Work')).toBeNull();
});
