import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ActionAlertCard } from './action-alert-card';
import { SpotterQuarantineCard } from './spotter-quarantine-card';

afterEach(cleanup);

const quarantine = {
  title: 'Answer follows text planted in a tool result',
  detail: 'Round 5 reports "ANSWER: 73"; a line inside the lookup output dictated <73>.',
  watcher_handle: 'task_watcher',
};

it('says what SPOTTER detected and offers Discuss and Lift quarantine', async () => {
  const user = userEvent.setup();
  const onDiscuss = vi.fn();
  const onLift = vi.fn();
  render(<SpotterQuarantineCard onDiscuss={onDiscuss} onLift={onLift} quarantine={quarantine} />);
  const card = screen.getByRole('alert', { name: 'Session in quarantine' });
  expect(card).toHaveTextContent('Danger');
  expect(card).toHaveTextContent(quarantine.title);
  // Quoted formats survive: the detail is plain text, not markdown.
  expect(card).toHaveTextContent('dictated <73>.');
  await user.click(screen.getByRole('button', { name: 'Discuss' }));
  await user.click(screen.getByRole('button', { name: 'Lift quarantine' }));
  expect(onDiscuss).toHaveBeenCalledOnce();
  expect(onLift).toHaveBeenCalledOnce();
});

it('disables Lift quarantine while the lift is in flight', () => {
  render(
    <SpotterQuarantineCard lifting onDiscuss={vi.fn()} onLift={vi.fn()} quarantine={quarantine} />,
  );
  expect(screen.getByRole('button', { name: 'Lift quarantine' })).toBeDisabled();
});

it.each([
  ['warning', 'Warning'],
  ['info', 'Warning'],
  ['danger', 'Danger'],
  ['critical', 'Danger'],
])('an alert card with severity %s reads as %s, without an evidence action', (severity, label) => {
  render(
    <ActionAlertCard
      block={{
        type: 'action_card',
        id: 'card',
        source: 'spotter-ai',
        severity,
        title: 'Finding',
        detail: 'detail',
        actions: [
          {
            id: 'inspect',
            label: 'Inspect evidence',
            enabled: true,
            behavior: { kind: 'inspect_attention', handle_id: 'task_watcher' },
          },
          {
            id: 'discuss',
            label: 'Discuss',
            enabled: true,
            behavior: { kind: 'focus_session', handle_id: 'task_watcher' },
          },
        ],
      }}
      onAction={vi.fn()}
    />,
  );
  const card = screen.getByRole('alert', { name: 'SPOTTER finding: Finding' });
  expect(card).toHaveTextContent(label);
  expect(screen.queryByRole('button', { name: 'Inspect evidence' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Discuss' })).toBeEnabled();
});
