import { TransportError } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import {
  canOpenSessionStream,
  canUploadWorkspaceResources,
  conversationUnavailableMessage,
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
});
