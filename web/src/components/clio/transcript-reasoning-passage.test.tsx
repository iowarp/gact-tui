import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { TranscriptReasoningPassage } from './transcript-reasoning-passage';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('names the thought by its time and offers its recorded headings on the disclosure', () => {
  render(<TranscriptReasoningPassage text="**Reviewing the dataset****Delegating the audit**" />);
  expect(screen.getByText('Thought', { exact: true })).toBeVisible();
  const trigger = screen.getByRole('button', {
    name: 'Thinking: Reviewing the dataset Delegating the audit',
  });
  fireEvent.click(trigger);
  // The body keeps the recorded source text; only the row's label separates the headings.
  expect(screen.getByRole('region', { name: 'Thinking details' })).toHaveTextContent(
    /Reviewing the dataset.*Delegating the audit/u,
  );
});

it('ticks only while thinking and settles on its own recorded duration', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-15T18:00:00Z'));
  const view = render(
    <TranscriptReasoningPassage
      text="Checking the file."
      streaming
      startedAt="2026-10-15T18:00:00Z"
    />,
  );
  act(() => {
    vi.advanceTimersByTime(3000);
  });
  expect(screen.getByText('Thinking…')).toBeVisible();
  expect(screen.getByRole('img', { name: 'Thinking' })).toBeInTheDocument();
  view.rerender(<TranscriptReasoningPassage text="Checking the file." durationMs={2400} />);
  act(() => {
    vi.advanceTimersByTime(33_900);
  });
  expect(screen.getByText('Thought for 2 seconds')).toBeVisible();
  expect(screen.queryByText('Thinking…')).not.toBeInTheDocument();
});

it('does not infer historical reasoning time from a following tool or the mount time', () => {
  render(<TranscriptReasoningPassage text="Earlier reasoning." />);
  expect(screen.getByText('Thought', { exact: true })).toBeVisible();
  expect(screen.queryByText(/Thought for/)).not.toBeInTheDocument();
});

it.each([
  'Awaiting treatment definitions',
  '**Awaiting treatment definitions**',
  'Awaiting treatment definitions\n\n',
])('keeps a complete single-line thought folded behind its row: %s', (text) => {
  render(<TranscriptReasoningPassage text={text} />);
  const trigger = screen.getByRole('button', { name: 'Thinking: Awaiting treatment definitions' });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('region', { name: 'Thinking details' })).not.toBeInTheDocument();
  fireEvent.click(trigger);
  expect(screen.getByRole('region', { name: 'Thinking details' })).toHaveTextContent(
    'Awaiting treatment definitions',
  );
});

it('labels reasoning separately from execution while offering its recorded details', () => {
  render(
    <TranscriptReasoningPassage
      text={'**Reviewing the results**\n\nThe audit is still running.'}
    />,
  );
  const trigger = screen.getByRole('button', { name: 'Thinking: Reviewing the results' });
  expect(screen.getByText('Thought', { exact: true })).toBeVisible();
  fireEvent.click(trigger);
  expect(screen.getByRole('region', { name: 'Thinking details' })).toHaveTextContent(
    'The audit is still running.',
  );
});

it('preserves literal underscores and the source identity in a complete thought', () => {
  const view = render(
    <TranscriptReasoningPassage
      text="Review input_values before the next step."
      source={{ messageId: 'm', sessionId: 's', partId: 'r', field: 'text' }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /^Thinking:/ }));
  expect(screen.getByText('Review input_values before the next step.')).toBeVisible();
  expect(view.container.querySelector('[data-part-id="r"]')).toHaveAttribute('data-field', 'text');
  expect(view.container.querySelector('[data-content-revision]')).not.toBeNull();
});

it.each([
  [332, 'Thought for 1 second'],
  [6_200, 'Thought for 6 seconds'],
  [125_000, 'Thought for 2 minutes'],
])('names a %i ms thought "%s"', (durationMs, name) => {
  render(<TranscriptReasoningPassage text="Expanding catalog search" durationMs={durationMs} />);
  expect(screen.getByText(name)).toBeVisible();
});

it('keeps multi-line reasoning reachable with the keyboard after the header change', async () => {
  const user = userEvent.setup();
  render(
    <TranscriptReasoningPassage
      text={
        '**Preparing TRPA GeoJSON**\n\nInspect the selected resource and retain the source identity.'
      }
      durationMs={550}
    />,
  );
  const trigger = screen.getByRole('button', { name: 'Thinking: Preparing TRPA GeoJSON' });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await user.tab();
  expect(trigger).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(await screen.findByRole('region', { name: 'Thinking details' })).toHaveTextContent(
    'Inspect the selected resource and retain the source identity.',
  );
  await user.keyboard('{Enter}');
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

it('stays open while the thought streams and folds once it settles', async () => {
  const text = 'Comparing the rounds\nRound 1 peaked at t100; round 5 must agree.';
  const view = render(<TranscriptReasoningPassage id="r1" streaming text={text} />);
  expect(screen.getByRole('button', { name: 'Thinking: Comparing the rounds' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  view.rerender(<TranscriptReasoningPassage id="r1" text={text} />);
  expect(screen.getByRole('button', { name: 'Thinking: Comparing the rounds' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  // A reader's choice outlasts the default.
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Thinking: Comparing the rounds' }));
  view.rerender(<TranscriptReasoningPassage id="r1" streaming text={text} />);
  view.rerender(<TranscriptReasoningPassage id="r1" text={text} />);
  expect(screen.getByRole('button', { name: 'Thinking: Comparing the rounds' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});
