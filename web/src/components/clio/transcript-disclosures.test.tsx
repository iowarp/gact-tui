import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useTranscriptDisclosure } from './transcript-disclosure-context';
import { TranscriptDisclosures } from './transcript-disclosures';

afterEach(cleanup);

function ThinkingChoice() {
  const [open, setOpen] = useTranscriptDisclosure('thinking');
  return (
    <button aria-expanded={open} onClick={() => setOpen(!open)}>
      Thinking
    </button>
  );
}

it('retains choices when the responsive conversation and its nested provider remount', () => {
  const view = render(
    <TranscriptDisclosures sessionId="session-one">
      <TranscriptDisclosures sessionId="session-one" key="desktop">
        <ThinkingChoice />
      </TranscriptDisclosures>
    </TranscriptDisclosures>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Thinking' }));
  view.rerender(
    <TranscriptDisclosures sessionId="session-one">
      <TranscriptDisclosures sessionId="session-one" key="mobile">
        <ThinkingChoice />
      </TranscriptDisclosures>
    </TranscriptDisclosures>,
  );
  expect(screen.getByRole('button', { name: 'Thinking' })).toHaveAttribute('aria-expanded', 'true');
  view.rerender(
    <TranscriptDisclosures sessionId="session-two">
      <ThinkingChoice />
    </TranscriptDisclosures>,
  );
  expect(screen.getByRole('button', { name: 'Thinking' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

it('keeps a child conversation independent from its parent even with the same entry id', () => {
  const view = render(
    <TranscriptDisclosures sessionId="parent">
      <ThinkingChoice />
    </TranscriptDisclosures>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Thinking' }));
  view.rerender(
    <TranscriptDisclosures sessionId="parent">
      <TranscriptDisclosures sessionId="child">
        <ThinkingChoice />
      </TranscriptDisclosures>
    </TranscriptDisclosures>,
  );
  expect(screen.getByRole('button', { name: 'Thinking' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  view.rerender(
    <TranscriptDisclosures sessionId="parent">
      <ThinkingChoice />
    </TranscriptDisclosures>,
  );
  expect(screen.getByRole('button', { name: 'Thinking' })).toHaveAttribute('aria-expanded', 'true');
});
