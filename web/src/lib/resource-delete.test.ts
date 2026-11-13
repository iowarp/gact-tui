import { TransportError } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { vocab } from '@/lib/brand-vocabulary';
import { deleteFailure } from './resource-delete';

describe('deleteFailure', () => {
  it('explains a refusal for running work instead of the status line', () => {
    const error = new TransportError(
      'Cancel and settle active work before deleting this session.',
      409,
      'session_has_active_work',
      { handles: ['task_1'] },
    );
    expect(deleteFailure(error)).toBe(
      'Work this conversation started is still running. Wait for it to finish or cancel it, then delete the conversation.',
    );
  });

  it('explains why a workspace with running work is kept', () => {
    const error = new TransportError(
      'Cancel and settle the work its conversations started before removing this workspace.',
      409,
      'workspace_has_active_work',
      { workspace_id: 'ws_1', sessions: { sess_1: ['task_1'] } },
    );
    expect(deleteFailure(error)).toBe(
      `Work started by a conversation in this ${vocab.workspace} is still running. Wait for it to finish or cancel it, then remove the ${vocab.workspace}.`,
    );
  });

  it('keeps any other failure as it is', () => {
    expect(deleteFailure(new Error('Unable to reach the service'))).toBe(
      'Unable to reach the service',
    );
  });
});
