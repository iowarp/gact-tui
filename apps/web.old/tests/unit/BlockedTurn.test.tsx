/**
 * GAP 1 — the "Turn blocked" pill.
 *
 * A pre_message hook block folds into message.completed with
 * stop_reason "blocked" + error_info on the USER message (no assistant
 * message exists). The transcript renders a distinct, warning-toned pill
 * with the hook's reason, and never offers Regenerate.
 */
import { render, screen, cleanup } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { Transcript } from '../../src/components/Transcript.js';
import type { Message } from '@clio/core';

afterEach(cleanup);

const BLOCKED_USER_MSG: Message = {
  id: 'usr_1',
  role: 'user',
  stop_reason: 'blocked',
  error_info: {
    error: 'permission_error',
    message: 'Message blocked by pre_message hook.',
    recoverable: true,
  },
  parts: [{ type: 'text', text: 'please BLOCKME' }],
} as Message;

describe('Transcript blocked pill (GAP 1)', () => {
  it('renders the blocked pill on a blocked user message', () => {
    render(() => <Transcript messages={[BLOCKED_USER_MSG]} density="normal" />);
    const pill = screen.getByTestId('msg-blocked-usr_1');
    expect(pill).toBeTruthy();
    expect(pill.textContent).toContain('Turn blocked');
    // Title from error_info.error, body from error_info.message.
    expect(pill.textContent).toContain('permission_error');
    expect(pill.textContent).toContain('Message blocked by pre_message hook.');
  });

  it('does NOT render the generic error pill for a blocked turn', () => {
    render(() => <Transcript messages={[BLOCKED_USER_MSG]} density="normal" />);
    expect(screen.queryByTestId('msg-error-usr_1')).toBeNull();
  });

  it('never offers Regenerate/Retry on a blocked user message', () => {
    render(() => (
      <Transcript
        messages={[BLOCKED_USER_MSG]}
        density="normal"
        onRegenerate={() => undefined}
      />
    ));
    // No assistant turn → no error-retry button, and the regen action is
    // assistant-gated so it never appears on a user row.
    expect(screen.queryByTestId('msg-error-retry-usr_1')).toBeNull();
    expect(screen.queryByTestId('msg-regen-usr_1')).toBeNull();
  });

  it('leaves a normal assistant error untouched (still the error pill + Retry)', () => {
    const erroredAssistant: Message = {
      id: 'a1',
      role: 'assistant',
      stop_reason: 'error',
      error_info: { error: 'provider_error', message: 'upstream 500', recoverable: true },
      parts: [{ type: 'text', text: 'partial' }],
    } as Message;
    render(() => (
      <Transcript
        messages={[erroredAssistant]}
        density="normal"
        onRegenerate={() => undefined}
      />
    ));
    expect(screen.getByTestId('msg-error-a1')).toBeTruthy();
    expect(screen.queryByTestId('msg-blocked-a1')).toBeNull();
    expect(screen.getByTestId('msg-error-retry-a1')).toBeTruthy();
  });
});
