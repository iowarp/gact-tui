import { describe, expect, it, vi } from 'vitest';
import type { ComposerRepository, WorkspaceResource } from '@clio/core/v3';
import { uploadWorkspaceResources } from './upload-workspace-resources';

function resource(overrides: Partial<WorkspaceResource> = {}): WorkspaceResource {
  return {
    id: 'resource_1',
    workspace_id: 'workspace_1',
    client_upload_id: 'browser-stable',
    revision: 1,
    name: 'notes.md',
    claimed_mime: 'text/markdown',
    detected_mime: '',
    detection_source: '',
    declared_size: 12,
    received_size: 0,
    sha256: '',
    state: 'uploading',
    failure: '',
    created_at: '2026-08-31T12:00:00Z',
    updated_at: '2026-08-31T12:00:00Z',
    completed_at: '',
    mime_mismatch: false,
    ...overrides,
  };
}

describe('uploadWorkspaceResources', () => {
  it('resumes from server-authoritative bytes and preserves a partial upload on failure', async () => {
    const content = new Blob(['hello world!'], { type: 'text/markdown' });
    const url = 'blob:test-resumable';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => content }));
    const createResource = vi.fn().mockResolvedValue(resource({ received_size: 6 }));
    const appendResourceBytes = vi.fn().mockRejectedValue(new Error('connection interrupted'));
    const deleteResource = vi.fn();
    const repository = {
      appendResourceBytes,
      createResource,
      deleteResource,
      resource: vi.fn(),
    } as unknown as ComposerRepository;

    await expect(
      uploadWorkspaceResources({
        files: [{ type: 'file', filename: 'notes.md', mediaType: 'text/markdown', url }],
        repository,
        workspaceId: 'workspace_1',
      }),
    ).rejects.toThrow('connection interrupted');

    expect(createResource).toHaveBeenCalledWith(
      'workspace_1',
      expect.objectContaining({
        clientUploadId: expect.stringMatching(/^browser-[0-9a-f]{64}$/),
      }),
    );
    expect(appendResourceBytes).toHaveBeenCalledWith(
      'workspace_1',
      'resource_1',
      6,
      new Uint8Array(await content.slice(6).arrayBuffer()),
    );
    expect(deleteResource).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('skips bytes when the idempotent resource is already ready', async () => {
    const content = new Blob(['hello world!'], { type: 'text/markdown' });
    const url = 'blob:test-ready';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => content }));
    const ready = resource({
      detected_mime: 'text/markdown',
      received_size: content.size,
      sha256: 'abc',
      state: 'ready',
    });
    const repository = {
      appendResourceBytes: vi.fn(),
      createResource: vi.fn().mockResolvedValue(ready),
      resource: vi.fn(),
    } as unknown as ComposerRepository;

    await expect(
      uploadWorkspaceResources({
        files: [{ type: 'file', filename: 'notes.md', mediaType: 'text/markdown', url }],
        repository,
        workspaceId: 'workspace_1',
      }),
    ).resolves.toMatchObject({
      parts: [{ type: 'resource_ref', resource_id: 'resource_1' }],
      resources: [{ state: 'ready' }],
    });
    expect(repository.appendResourceBytes).not.toHaveBeenCalled();
    expect(repository.resource).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
