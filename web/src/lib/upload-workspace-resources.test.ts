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
      undefined,
    );
    expect(appendResourceBytes).toHaveBeenCalledWith(
      'workspace_1',
      'resource_1',
      6,
      new Uint8Array(await content.slice(6).arrayBuffer()),
      undefined,
    );
    // The partial upload is left in custody so the next attempt resumes from
    // the bytes the service already holds.
    expect(deleteResource).not.toHaveBeenCalled();
    expect(createResource).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('refuses an idempotent replay whose custody record holds none of the bytes', async () => {
    const content = new Blob(['hello world!'], { type: 'text/markdown' });
    const url = 'blob:test-unsafe-replay';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => content }));
    const repository = {
      appendResourceBytes: vi.fn(),
      createResource: vi
        .fn()
        .mockResolvedValue(resource({ received_size: 0, sha256: 'abc', state: 'ready' })),
      resource: vi.fn(),
    } as unknown as ComposerRepository;

    await expect(
      uploadWorkspaceResources({
        files: [{ type: 'file', filename: 'notes.md', mediaType: 'text/markdown', url }],
        repository,
        workspaceId: 'workspace_1',
      }),
    ).rejects.toThrow(/0 of 12 bytes/);
    vi.unstubAllGlobals();
  });

  it('waits out a transient uploading state instead of calling it a custody refusal', async () => {
    const content = new Blob(['hello world!'], { type: 'text/markdown' });
    const url = 'blob:test-transient';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => content }));
    const read = vi
      .fn()
      .mockResolvedValueOnce(resource({ received_size: content.size, state: 'uploading' }))
      .mockResolvedValueOnce(
        resource({ received_size: content.size, sha256: 'abc', state: 'ready' }),
      );
    const repository = {
      appendResourceBytes: vi.fn().mockResolvedValue(undefined),
      createResource: vi.fn().mockResolvedValue(resource({ received_size: 0 })),
      resource: read,
    } as unknown as ComposerRepository;

    await expect(
      uploadWorkspaceResources({
        files: [{ type: 'file', filename: 'notes.md', mediaType: 'text/markdown', url }],
        repository,
        workspaceId: 'workspace_1',
      }),
    ).resolves.toMatchObject({ resources: [{ state: 'ready' }] });
    expect(read).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it('reports the service failure text when custody terminally refuses the upload', async () => {
    const content = new Blob(['hello world!'], { type: 'text/markdown' });
    const url = 'blob:test-quarantined';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => content }));
    const repository = {
      appendResourceBytes: vi.fn().mockResolvedValue(undefined),
      createResource: vi.fn().mockResolvedValue(resource({ received_size: 0 })),
      resource: vi.fn().mockResolvedValue(
        resource({
          failure: 'Signature scan flagged this file.',
          received_size: content.size,
          state: 'quarantined',
        }),
      ),
    } as unknown as ComposerRepository;

    await expect(
      uploadWorkspaceResources({
        files: [{ type: 'file', filename: 'notes.md', mediaType: 'text/markdown', url }],
        repository,
        workspaceId: 'workspace_1',
      }),
    ).rejects.toThrow('Signature scan flagged this file.');
    vi.unstubAllGlobals();
  });

  it('stops the readiness wait when the caller navigates away', async () => {
    const content = new Blob(['hello world!'], { type: 'text/markdown' });
    const url = 'blob:test-aborted';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => content }));
    const controller = new AbortController();
    const repository = {
      appendResourceBytes: vi.fn().mockResolvedValue(undefined),
      createResource: vi.fn().mockResolvedValue(resource({ received_size: 0 })),
      resource: vi.fn().mockImplementation(async () => {
        controller.abort();
        return resource({ received_size: content.size, state: 'uploading' });
      }),
    } as unknown as ComposerRepository;

    await expect(
      uploadWorkspaceResources({
        files: [{ type: 'file', filename: 'notes.md', mediaType: 'text/markdown', url }],
        repository,
        signal: controller.signal,
        workspaceId: 'workspace_1',
      }),
    ).rejects.toThrow(/cancelled/i);
    expect(repository.resource).toHaveBeenCalledTimes(1);
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
