/**
 * Transcript contract (gact-tui#333).
 *
 * ONE part-renderer registry. The legacy tree's dual pipeline dies with it —
 * there is exactly one path from a wire part to a rendered part, and an
 * unknown kind is SURFACED, never dropped.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Message } from '@clio/core';
import { describe, expect, it } from 'vitest';
import { Transcript } from '../../src/transcript/Transcript';
import { PART_RENDERERS } from '../../src/transcript/registry';

function msg(id: string, role: Message['role'], parts: unknown[]): Message {
  return { id, role, parts: parts as Message['parts'] };
}

describe('part renderer registry', () => {
  it('covers the part kinds the backend actually emits today', () => {
    // Kinds proven present in clio-agent develop. a2ui/permission are P3 and
    // deliberately absent until the backend emits them.
    for (const kind of [
      'text',
      'thinking',
      'tool_call',
      'tool_result',
      'expert_handoff',
      'routing_decision',
      'resource_link',
      'file_diff',
      'compaction',
      'error',
    ]) {
      expect(PART_RENDERERS[kind], `no renderer for "${kind}"`).toBeDefined();
    }
  });
});

describe('Transcript', () => {
  it('renders a user message', () => {
    render(<Transcript messages={[msg('m1', 'user', [{ type: 'text', text: 'hello' }])]} />);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('renders assistant text', () => {
    render(
      <Transcript messages={[msg('m1', 'assistant', [{ type: 'text', text: 'the answer' }])]} />,
    );
    expect(screen.getByText('the answer')).toBeInTheDocument();
  });

  it('collapses thinking by default and expands on click', () => {
    render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            { type: 'thinking', thinking: 'internal reasoning here', tokens: 77 },
          ]),
        ]}
      />,
    );
    const toggle = screen.getByRole('button', { name: /thinking/i });
    // Collapsed: the token count is the summary, the body is not rendered.
    expect(toggle).toHaveTextContent('77');
    expect(screen.queryByText('internal reasoning here')).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByText('internal reasoning here')).toBeInTheDocument();
  });

  it('renders a tool call with its params as a key/value grid', () => {
    const { container } = render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            {
              type: 'tool_call',
              id: 'tc1',
              name: 'geo_geocode',
              input: { query: 'Los Angeles, California', countrycodes: 'us' },
            },
          ]),
        ]}
      />,
    );
    expect(screen.getByText('geo_geocode')).toBeInTheDocument();
    expect(container.querySelector('.kit-kvgrid')).not.toBeNull();
    expect(screen.getByText('Los Angeles, California')).toBeInTheDocument();
  });

  it('renders an expert handoff with the child name', () => {
    render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            {
              type: 'expert_handoff',
              expert: 'geospatial',
              task_id: 'task_b7525159dde5',
              question: 'Resolve Los Angeles into coordinates',
            },
          ]),
        ]}
      />,
    );
    expect(screen.getByText('geospatial')).toBeInTheDocument();
  });

  it('SURFACES an unknown part kind rather than dropping it', () => {
    // No silent fallback: a kind this build cannot render must be visible and
    // named, so a wire change can never quietly erase content.
    render(
      <Transcript
        messages={[msg('m1', 'assistant', [{ type: 'some_future_kind', payload: 1 }])]}
      />,
    );
    const unknown = screen.getByTestId('part-unrenderable');
    expect(unknown).toHaveTextContent('some_future_kind');
  });

  it('never renders an empty message frame', () => {
    const { container } = render(<Transcript messages={[msg('m1', 'assistant', [])]} />);
    expect(container.querySelector('.transcript__message')).toBeNull();
  });

  it('keeps every part of a message in wire order', () => {
    const { container } = render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            { type: 'text', text: 'first' },
            { type: 'thinking', thinking: 'second', tokens: 3 },
            { type: 'text', text: 'third' },
          ]),
        ]}
      />,
    );
    const frames = container.querySelectorAll('.kit-partcard');
    expect(frames).toHaveLength(3);
    expect(frames[0]).toHaveTextContent('first');
    expect(frames[2]).toHaveTextContent('third');
  });

  it('labels each message by its role for assistive tech', () => {
    render(<Transcript messages={[msg('m1', 'user', [{ type: 'text', text: 'hi' }])]} />);
    expect(screen.getByRole('article', { name: /user/i })).toBeInTheDocument();
  });

  it('renders an error part in the error tone with its message', () => {
    render(
      <Transcript
        messages={[msg('m1', 'assistant', [{ type: 'error', message: 'tool exploded' }])]}
      />,
    );
    const err = screen.getByTestId('part-error');
    expect(within(err).getByText(/tool exploded/)).toBeInTheDocument();
  });
});
