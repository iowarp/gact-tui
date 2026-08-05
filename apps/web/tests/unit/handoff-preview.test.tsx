/**
 * P4R prototype rule (owner capture): while a delegation runs, its Call box
 * must NOT sit empty — it streams the child's own partial text into the
 * running card with a trailing cursor block and a ticking "running (1m 22s)"
 * elapsed reading. Children are real sessions with their own SSE stream, so
 * this is rendering the child's own wire in the parent's box, not a
 * client-side fabrication.
 */
import { act, render, screen } from '@testing-library/react';
import type { Message } from '@clio/core';
import { describe, expect, it, vi } from 'vitest';
import { Transcript } from '../../src/transcript/Transcript';
import { MergedHandoff } from '../../src/transcript/parts/HandoffPart';

function msg(id: string, parts: unknown[]): Message {
  return { id, role: 'assistant', parts: parts as Message['parts'] };
}

const STARTED_HANDOFF = {
  type: 'expert_handoff',
  id: 'live_handoff_preview',
  child_agent: 'geospatial',
  stage: 'delegate.started',
  handle_id: 'task_preview_1',
  run_label: 'geospatial #1',
  status: 'running',
  metadata: { question: 'Resolve LA into coordinates.' },
};

const SETTLED_HANDOFF = {
  ...STARTED_HANDOFF,
  stage: 'delegate.completed',
  status: 'completed',
  duration_ms: 72000,
  metadata: {
    question: 'Resolve LA into coordinates.',
    output: 'Resolved LA to center 34.0537, -118.2428.',
  },
};

describe('running Call box preview, threaded through Transcript by handle_id', () => {
  it('renders the streamed tail with a trailing cursor when childPreviews carries an entry', () => {
    render(
      <Transcript
        messages={[msg('m1', [STARTED_HANDOFF])]}
        childPreviews={{ task_preview_1: { text: 'Resolving the query against the gazetteer…' } }}
      />,
    );
    const preview = screen.getByTestId('part-childcard-preview');
    expect(preview).toHaveTextContent('Resolving the query against the gazetteer…');
    expect(preview.querySelector('.part-childcard__cursor')).not.toBeNull();
    expect(preview.querySelector('.part-childcard__cursor')).toHaveTextContent('▍');
  });

  it('a running box with no matching preview entry renders no body at all', () => {
    render(<Transcript messages={[msg('m1', [STARTED_HANDOFF])]} childPreviews={{}} />);
    const card = screen.getByTestId('part-child-card');
    expect(screen.queryByTestId('part-childcard-preview')).toBeNull();
    expect(card.querySelector('.part-childcard__body')).toBeNull();
    // The footer still renders — the box is never empty of its OWN chrome.
    expect(card).toHaveTextContent('● running');
  });

  it('a running box is unaffected when childPreviews is omitted entirely', () => {
    render(<Transcript messages={[msg('m1', [STARTED_HANDOFF])]} />);
    expect(screen.queryByTestId('part-childcard-preview')).toBeNull();
    expect(screen.getByTestId('part-child-card')).toHaveTextContent('● running');
  });

  it('a settled box ignores a preview entry even if one is still keyed to its handle', () => {
    render(
      <Transcript
        messages={[msg('m1', [SETTLED_HANDOFF])]}
        childPreviews={{ task_preview_1: { text: 'stale streamed fragment' } }}
      />,
    );
    const card = screen.getByTestId('part-child-card');
    // The real settled answer renders, never the stale preview text.
    expect(card).toHaveTextContent('Resolved LA to center 34.0537, -118.2428.');
    expect(card.textContent).not.toContain('stale streamed fragment');
    expect(screen.queryByTestId('part-childcard-preview')).toBeNull();
    expect(card.querySelector('.part-childcard__cursor')).toBeNull();
  });

  it('a mismatched handle_id in childPreviews never leaks onto the wrong box', () => {
    render(
      <Transcript
        messages={[msg('m1', [STARTED_HANDOFF])]}
        childPreviews={{ some_other_handle: { text: 'not this box' } }}
      />,
    );
    expect(screen.queryByTestId('part-childcard-preview')).toBeNull();
  });
});

describe('MergedHandoff preview prop (direct, per the running-card contract)', () => {
  it('running + preview prop renders the tail and cursor', () => {
    render(<MergedHandoff terminal={STARTED_HANDOFF} preview={{ text: 'partial output here' }} />);
    const preview = screen.getByTestId('part-childcard-preview');
    expect(preview).toHaveTextContent('partial output here');
    expect(preview.querySelector('.part-childcard__cursor')).not.toBeNull();
  });

  it('running + no preview prop renders no body', () => {
    render(<MergedHandoff terminal={STARTED_HANDOFF} />);
    expect(screen.queryByTestId('part-childcard-preview')).toBeNull();
    expect(screen.getByTestId('part-child-card').querySelector('.part-childcard__body')).toBeNull();
  });

  it('running + an empty-text preview (subscribed but nothing streamed yet) renders no body', () => {
    render(<MergedHandoff terminal={STARTED_HANDOFF} preview={{ text: '' }} />);
    expect(screen.queryByTestId('part-childcard-preview')).toBeNull();
  });

  it('settled box ignores the preview prop entirely', () => {
    render(<MergedHandoff terminal={SETTLED_HANDOFF} preview={{ text: 'should never show' }} />);
    expect(screen.queryByTestId('part-childcard-preview')).toBeNull();
    expect(screen.getByTestId('part-child-card').textContent).not.toContain('should never show');
  });

  it('ticks the elapsed reading in the footer off preview.startedAt, once per second', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-08-05T00:00:00.000Z'));
      const startedAt = new Date(Date.now() - 82_000).toISOString(); // 1m 22s ago
      render(<MergedHandoff terminal={STARTED_HANDOFF} preview={{ text: 'working…', startedAt }} />);
      const card = screen.getByTestId('part-child-card');
      expect(card).toHaveTextContent('● running (1m 22s)');

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      expect(card).toHaveTextContent('● running (1m 23s)');
    } finally {
      vi.useRealTimers();
    }
  });
});
