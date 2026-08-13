import { render, screen, cleanup, within } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import type { Part } from '@clio/core';
import { Transcript } from '../../src/components/Transcript.js';

afterEach(cleanup);

/**
 * v0.2 transcript part types (SPEC §4.5): document, subagent_call/result,
 * resource_link/resource, citation, agent_question, retry_attempt, plus the
 * forward-compat unknown-part fallback (SPEC §8.3). The web typed these in
 * @clio/core but the dispatcher dropped them; these guards prove each renders
 * its key data and that an unrecognised type is surfaced, not swallowed.
 */
function renderPart(part: Part) {
  render(() => (
    <Transcript
      density="verbose"
      messages={[
        {
          id: 'm-new',
          role: 'assistant',
          parts: [part],
        },
      ]}
    />
  ));
}

describe('new transcript part types', () => {
  it('renders an exact-revision artifact review as a user-facing comment', () => {
    renderPart({
      type: 'artifact_review',
      review_id: 'review-1',
      artifact_id: 'artifact-1',
      artifact_version: 3,
      artifact_sha256: 'a'.repeat(64),
      review_text: 'Keep the caveat next to the result.',
      anchor: { profile: 'text-quote', exact: 'tentative result' },
      metadata: { artifact_name: 'brief.md' },
    });
    const el = screen.getByTestId('artifact-review-review-1');
    expect(el.textContent).toContain('brief.md · v3');
    expect(el.textContent).toContain('tentative result');
    expect(el.textContent).toContain('Keep the caveat next to the result.');
  });

  it('renders a document part with title, context and source', () => {
    renderPart({
      type: 'document',
      title: 'Design Spec',
      context: 'grounding context',
      source: { kind: 'url', url: 'https://example.com/spec.pdf' },
      citations: { enabled: true },
    });
    const el = screen.getByTestId('trx-document');
    expect(within(el).getByText('Design Spec')).toBeTruthy();
    expect(within(el).getByText('grounding context')).toBeTruthy();
    expect(within(el).getByText('citable')).toBeTruthy();
    expect(screen.getByTestId('trx-document-source').textContent).toContain(
      'https://example.com/spec.pdf',
    );
  });

  it('renders a subagent_call with agent id and prompt', () => {
    renderPart({
      type: 'subagent_call',
      agent_id: 'researcher',
      subsession_id: 'sub-1',
      prompt: 'find the bug',
    });
    const el = screen.getByTestId('trx-subagent-call');
    expect(within(el).getByText('researcher')).toBeTruthy();
    expect(screen.getByTestId('trx-subagent-prompt').textContent).toContain('find the bug');
  });

  it('renders a subagent_result with summary and a final-message link', () => {
    renderPart({
      type: 'subagent_result',
      summary: 'done investigating',
      final_message_id: 'msg-final-9',
    });
    expect(screen.getByTestId('trx-subagent-summary').textContent).toContain('done investigating');
    const link = screen.getByTestId('trx-subagent-final-link') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('#msg-msg-final-9');
  });

  it('renders a resource_link with name, uri link and description', () => {
    renderPart({
      type: 'resource_link',
      uri: 'https://example.com/doc',
      name: 'API Doc',
      description: 'the reference',
      mime_type: 'text/html',
    });
    const el = screen.getByTestId('trx-resource-link');
    expect(within(el).getByText('API Doc')).toBeTruthy();
    expect(within(el).getByText('the reference')).toBeTruthy();
    const link = within(el).getByText('https://example.com/doc') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('https://example.com/doc');
  });

  it('renders an inline resource with mime type and text content', () => {
    renderPart({
      type: 'resource',
      uri: 'mcp://files/readme',
      mime_type: 'text/plain',
      content: [{ type: 'text', text: 'hello from the resource' }],
    });
    const el = screen.getByTestId('trx-resource');
    expect(within(el).getByText('mcp://files/readme')).toBeTruthy();
    expect(screen.getByTestId('trx-resource-content').textContent).toContain(
      'hello from the resource',
    );
  });

  it('renders a citation with text, source reference and range', () => {
    renderPart({
      type: 'citation',
      text: 'the cited span',
      source: { type: 'document', reference: 'spec.pdf' },
      text_range: { start: 10, end: 42 },
    });
    const el = screen.getByTestId('trx-citation');
    expect(within(el).getByText('the cited span')).toBeTruthy();
    const src = screen.getByTestId('trx-citation-source');
    expect(within(src).getByText('spec.pdf')).toBeTruthy();
    expect(src.textContent).toContain('chars 10');
  });

  it('renders an agent_question linking to the ask-user surface', () => {
    renderPart({
      type: 'agent_question',
      question: { id: 'q-7', prompt: 'Which file?', status: 'pending', choices: ['a.ts', 'b.ts'] },
    });
    const el = screen.getByTestId('trx-agent-question');
    expect(within(el).getByText('Which file?')).toBeTruthy();
    expect(within(el).getByText('a.ts')).toBeTruthy();
    const link = screen.getByTestId('trx-agent-question-link') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('#user-question-q-7');
  });

  it('renders a retry_attempt with attempt counter and reason', () => {
    renderPart({
      type: 'retry_attempt',
      retry_attempt: { attempt: 2, max_attempts: 3, reason: 'timeout' },
    });
    expect(screen.getByTestId('trx-retry-counter').textContent).toContain('attempt 2/3');
    const el = screen.getByTestId('trx-retry-attempt');
    expect(within(el).getByText('timeout')).toBeTruthy();
  });

  it('renders an error part with code, message and a recoverable hint', () => {
    renderPart({
      type: 'error',
      code: 'tool_timeout',
      message: 'the shell command did not return in time',
      recoverable: true,
    });
    const el = screen.getByTestId('trx-error-part');
    // It is NOT swallowed by the unknown-part fallback.
    expect(screen.queryByTestId('trx-unknown-part')).toBeNull();
    expect(screen.getByTestId('trx-error-code').textContent).toContain('tool_timeout');
    expect(screen.getByTestId('trx-error-message').textContent).toContain(
      'the shell command did not return in time',
    );
    expect(screen.getByTestId('trx-error-recoverable').textContent).toContain('recoverable');
    expect(el.getAttribute('role')).toBe('alert');
  });

  it('renders an unrecoverable error part hint', () => {
    renderPart({
      type: 'error',
      code: 'fatal_backend',
      message: 'the backend crashed',
      recoverable: false,
    });
    expect(screen.getByTestId('trx-error-recoverable').textContent).toContain('unrecoverable');
  });

  it('renders a compaction part with summary, message count and auto mode', () => {
    renderPart({
      type: 'compaction',
      summary: 'condensed the earlier exploration into a plan',
      compacted_message_ids: ['m-1', 'm-2', 'm-3'],
      auto: true,
    });
    expect(screen.queryByTestId('trx-unknown-part')).toBeNull();
    expect(screen.getByTestId('trx-compaction-summary').textContent).toContain(
      'condensed the earlier exploration into a plan',
    );
    expect(screen.getByTestId('trx-compaction-count').textContent).toContain(
      '3 messages compacted',
    );
    expect(screen.getByTestId('trx-compaction-mode').textContent).toContain('auto');
  });

  it('renders a manual compaction with a singular message count', () => {
    renderPart({
      type: 'compaction',
      summary: 'folded one stray message',
      compacted_message_ids: ['m-9'],
      auto: false,
    });
    expect(screen.getByTestId('trx-compaction-count').textContent).toContain('1 message compacted');
    expect(screen.getByTestId('trx-compaction-mode').textContent).toContain('manual');
  });

  it('renders a redacted_thinking note without exposing the opaque data blob', () => {
    renderPart({
      type: 'redacted_thinking',
      data: 'BASE64_OPAQUE_REDACTED_BLOB_XYZ',
      signature: 'sig-123',
    });
    const el = screen.getByTestId('trx-redacted-thinking');
    expect(screen.queryByTestId('trx-unknown-part')).toBeNull();
    expect(within(el).getByText('Redacted reasoning')).toBeTruthy();
    // The opaque blob and signature must never be rendered.
    expect(el.textContent).not.toContain('BASE64_OPAQUE_REDACTED_BLOB_XYZ');
    expect(el.textContent).not.toContain('sig-123');
  });

  it('renders the forward-compat fallback for an unrecognised part type', () => {
    // Cast through unknown: this `type` is intentionally not in the closed union.
    renderPart({ type: 'brand_new_part', payload: 1 } as unknown as Part);
    const el = screen.getByTestId('trx-unknown-part');
    expect(el.textContent).toContain('unsupported part');
    expect(within(el).getByText('brand_new_part')).toBeTruthy();
  });

  it('tolerates an unknown part carrying extra/nested fields without throwing', () => {
    // A future backend may attach arbitrary structured payloads to a new part
    // type. The fallback must surface the type and never leak/throw on extras.
    expect(() =>
      renderPart({
        type: 'speculative_future_part',
        nested: { deep: { value: 42 }, list: [1, 2, 3] },
        extra_flag: true,
        note: 'this should not appear verbatim as a known field',
      } as unknown as Part),
    ).not.toThrow();
    const el = screen.getByTestId('trx-unknown-part');
    expect(el.textContent).toContain('unsupported part');
    expect(within(el).getByText('speculative_future_part')).toBeTruthy();
  });

  it('does not throw and shows a placeholder type for a part with a null type', () => {
    // Odd/degenerate payload: `type` is null. The fallback coalesces to
    // 'unknown' rather than crashing the whole transcript render.
    expect(() => renderPart({ type: null, data: undefined } as unknown as Part)).not.toThrow();
    const el = screen.getByTestId('trx-unknown-part');
    expect(el.textContent).toContain('unsupported part');
    expect(within(el).getByText('unknown')).toBeTruthy();
  });

  it('does not throw for an empty-string part type and labels it unknown', () => {
    expect(() => renderPart({ type: '' } as unknown as Part)).not.toThrow();
    const el = screen.getByTestId('trx-unknown-part');
    expect(within(el).getByText('unknown')).toBeTruthy();
  });
});
