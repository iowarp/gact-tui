import { TransportError } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { sessionDeleteFailure } from './session-delete';

describe('sessionDeleteFailure', () => {
  it('explains a refusal for running work instead of the status line', () => {
    const error = new TransportError(
      'Cancel and settle active work before deleting this session.',
      409,
      'session_has_active_work',
      { handles: ['task_1'] },
    );
    expect(sessionDeleteFailure(error)).toBe(
      'Work this conversation started is still running. Wait for it to finish or cancel it, then delete the conversation.',
    );
  });

  it('keeps any other failure as it is', () => {
    expect(sessionDeleteFailure(new Error('Unable to reach the service'))).toBe(
      'Unable to reach the service',
    );
  });
});
