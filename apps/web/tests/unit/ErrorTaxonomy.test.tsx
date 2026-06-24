import { render, screen, cleanup, within } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import type { Message } from '@clio/core';
import { MessageStatusPanels } from '../../src/components/TranscriptMessageStatus.js';

afterEach(cleanup);

/**
 * v0.2 structured error taxonomy (SPEC §14): clio ships `error_info.error`
 * (a taxonomy code) + `retry_after_s`. The inline error pill must render a
 * categorized label/tone per code, and an auto-retry hint when the error is
 * recoverable with a positive `retry_after_s`. These guard that behaviour.
 */
function msgWithError(error: Message['error_info']): Message {
  return {
    id: 'm-err',
    role: 'assistant',
    parts: [],
    stop_reason: 'error',
    error_info: error,
  };
}

describe('error taxonomy rendering', () => {
  it('renders a categorized label + tone for a known taxonomy code', () => {
    render(() => (
      <MessageStatusPanels
        msg={msgWithError({
          error: 'rate_limited',
          message: 'Soft limit reached',
          recoverable: true,
          retry_after_s: 12,
        })}
        isAssistant={true}
      />
    ));
    const pill = screen.getByTestId('msg-error-m-err');
    expect(pill.getAttribute('data-error-tone')).toBe('warning');
    expect(pill.getAttribute('data-error-code')).toBe('rate_limited');
    expect(within(pill).getByText('Rate limited')).toBeTruthy();
  });

  it('shows the auto-retry countdown hint when recoverable + retry_after_s is set', () => {
    render(() => (
      <MessageStatusPanels
        msg={msgWithError({
          error: 'rate_limited',
          message: 'backing off',
          recoverable: true,
          retry_after_s: 30,
        })}
        isAssistant={true}
      />
    ));
    const hint = screen.getByTestId('msg-error-autoretry-m-err');
    expect(hint.textContent).toContain('Auto-retry in 30s');
  });

  it('omits the auto-retry hint when retry_after_s is absent', () => {
    render(() => (
      <MessageStatusPanels
        msg={msgWithError({
          error: 'provider_error',
          message: 'auth failed',
          recoverable: true,
        })}
        isAssistant={true}
      />
    ));
    expect(screen.queryByTestId('msg-error-autoretry-m-err')).toBeNull();
    const pill = screen.getByTestId('msg-error-m-err');
    expect(pill.getAttribute('data-error-tone')).toBe('error');
    expect(within(pill).getByText('Provider error')).toBeTruthy();
  });

  it('falls back to a humanized label for unknown / vendor codes', () => {
    render(() => (
      <MessageStatusPanels
        msg={msgWithError({
          error: 'x_acme_quota_exceeded',
          message: 'quota',
          recoverable: false,
        })}
        isAssistant={true}
      />
    ));
    const pill = screen.getByTestId('msg-error-m-err');
    expect(pill.getAttribute('data-error-tone')).toBe('error');
    expect(within(pill).getByText('Quota Exceeded')).toBeTruthy();
  });
});
