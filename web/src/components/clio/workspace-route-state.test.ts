import { TransportError } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import {
  canOpenSessionStream,
  canUploadWorkspaceResources,
  conversationUnavailableMessage,
  planRevisionFromComposer,
} from './workspace-route-state';

describe('workspace route state', () => {
  it('opens the live stream even when the historical transcript is unavailable', () => {
    expect(canOpenSessionStream(['0.3', '0.2'], 'sess_1')).toBe(true);
    expect(canOpenSessionStream(['0.2'], 'sess_1')).toBe(false);
    expect(canOpenSessionStream(['0.3'], '')).toBe(false);
  });

  it('enables attachments only for the workspace resource custody contract', () => {
    expect(
      canUploadWorkspaceResources({
        attachments_upload: false,
        x_clio_resources: { enabled: true, custody: 'workspace' },
      }),
    ).toBe(true);
    expect(canUploadWorkspaceResources({ attachments_upload: true })).toBe(false);
    expect(canUploadWorkspaceResources({ x_clio_resources: { enabled: false } })).toBe(false);
  });

  it('reports the server error without rewriting it from its opaque details', () => {
    const error = new TransportError('Unhandled server error.', 500, 'internal_error', {
      original_error: 'RuntimeError',
      original_message: 'GetBlob operation failed',
    });

    expect(conversationUnavailableMessage(error)).toBe('Unhandled server error.');
  });

  it('routes typed composer feedback to the pending Plan review as a revision', () => {
    const interaction = {
      id: 'question:plan_exit',
      kind: 'question' as const,
      owner_session_id: 'sess_1',
      attended_session_id: 'sess_1',
      status: 'pending' as const,
      title: 'Review execution plan',
      source: { protocol: 'native' as const, tool_name: 'plan_exit' },
      created_at: '2026-09-05T00:00:00Z',
      actions: ['answer'],
    };

    expect(
      planRevisionFromComposer([interaction], {
        delivery: 'start',
        text: 'Add rollback and verification steps.',
      }),
    ).toEqual({
      interaction,
      response: {
        action: 'answer',
        answer: 'Add rollback and verification steps.',
        selected_options: ['reject'],
      },
    });
  });

  it('does not consume ordinary messages or drop revision attachments', () => {
    const interaction = {
      id: 'question:plan_exit',
      kind: 'question' as const,
      owner_session_id: 'sess_1',
      attended_session_id: 'sess_1',
      status: 'pending' as const,
      title: 'Review execution plan',
      source: { protocol: 'native' as const, tool_name: 'plan_exit' },
      created_at: '2026-09-05T00:00:00Z',
      actions: ['answer'],
    };

    expect(
      planRevisionFromComposer([interaction], {
        delivery: 'start',
        files: [{}],
        text: 'Use this reference.',
      }),
    ).toBeUndefined();
    expect(
      planRevisionFromComposer([{ ...interaction, status: 'answered' }], {
        delivery: 'start',
        text: 'Start a new task.',
      }),
    ).toBeUndefined();
  });
});
