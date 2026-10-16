import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TranscriptReasoningPassage } from './transcript-reasoning-passage';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('separates adjacent recorded headings without rewriting their source text', () => {
  render(<TranscriptReasoningPassage text="**Reviewing the dataset****Delegating the audit**" />);
  expect(screen.getByText('Reviewing the dataset Delegating the audit')).toBeVisible();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByText('Reviewing the datasetDelegating the audit')).not.toBeInTheDocument();
});

it('ticks only a known live reasoning phase and stops at its own recorded duration', () => {
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
  expect(screen.getByLabelText('Reasoning phase: 3 s')).toBeVisible();
  view.rerender(<TranscriptReasoningPassage text="Checking the file." durationMs={2400} />);
  act(() => {
    vi.advanceTimersByTime(33_900);
  });
  expect(screen.getByLabelText('Reasoning phase: 2.4 s')).toBeVisible();
});

it('does not infer historical reasoning time from a following tool or the mount time', () => {
  render(<TranscriptReasoningPassage text="Earlier reasoning." />);
  expect(screen.queryByLabelText(/Reasoning phase:/)).not.toBeInTheDocument();
});

it.each([
  'Awaiting treatment definitions',
  '**Awaiting treatment definitions**',
  'Awaiting treatment definitions\n\n',
])('renders a complete single-line thought as plain text without a disclosure: %s', (text) => {
  const view = render(<TranscriptReasoningPassage text={text} />);
  expect(screen.getByText('Awaiting treatment definitions')).toBeVisible();
  expect(screen.getByText('Thinking', { exact: true })).toBeVisible();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(view.container.querySelector('[aria-expanded]')).toBeNull();
  expect(view.container.querySelectorAll('svg')).toHaveLength(1);
});

it('labels reasoning separately from execution while offering its recorded details', () => {
  render(
    <TranscriptReasoningPassage
      text={'**Reviewing the results**\n\nThe audit is still running.'}
    />,
  );
  const trigger = screen.getByRole('button', { name: 'Thinking: Reviewing the results' });
  expect(trigger).toHaveTextContent('Reviewing the results');
  expect(screen.getByText('Thinking', { exact: true })).toBeVisible();
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
  expect(screen.getByText('Review input_values before the next step.')).toBeVisible();
  expect(view.container.querySelector('[data-part-id="r"]')).toHaveAttribute('data-field', 'text');
  expect(view.container.querySelector('[data-content-revision]')).not.toBeNull();
});
