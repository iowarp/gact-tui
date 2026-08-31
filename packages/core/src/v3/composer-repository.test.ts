import { describe, expect, it } from 'vitest';
import { ComposerRepository } from './composer-repository.js';
import type { QueuedMessage } from './composer-domain.js';
import { RecordingTransport } from './recording-transport.test-helper.js';

const behavior = {
  reasoning_effort: 'high' as const,
  execution_mode: 'execute' as const,
  confirmation_policy: 'ask' as const,
};

const model = { provider_id: 'codex', model_id: 'gpt-5.6-luna' };

describe('ComposerRepository', () => {
  it('submits an explicit delivery intent with immutable resource references', async () => {
    const transport = new RecordingTransport([
      {
        message_id: 'message_1',
        accepted_at: '2026-08-31T12:00:00Z',
        delivery: 'steer',
        state: 'pending_steer',
        effective_model: model,
        behavior,
        idempotent_replay: false,
      },
    ]);
    const repository = new ComposerRepository(transport);

    await repository.submitMessage('session 1', {
      parts: [
        { type: 'text', text: 'Inspect this resource.' },
        {
          type: 'resource_ref',
          resource_id: 'resource_1',
          resource_revision: '1',
          name: 'observations.csv',
        },
      ],
      client_message_id: 'message_1',
      idempotency_key: 'message_1',
      delivery: 'steer',
      behavior,
      model,
    });

    expect(transport.requests[0]).toMatchObject({
      method: 'POST',
      path: '/v1/sessions/session%201/messages',
      body: {
        client_message_id: 'message_1',
        idempotency_key: 'message_1',
        delivery: 'steer',
        behavior,
        model,
        parts: [
          { type: 'text', text: 'Inspect this resource.' },
          {
            type: 'resource_ref',
            resource_id: 'resource_1',
            resource_revision: '1',
            name: 'observations.csv',
          },
        ],
      },
    });
  });

  it('keeps queued-message order and revisions server authoritative', async () => {
    const queued = (id: string, revision: number, position: number): QueuedMessage => ({
      id,
      session_id: 'session_1',
      revision,
      position,
      parts: [{ type: 'text', text: id }],
      metadata: {},
      client_message_id: id,
      idempotency_key: id,
      behavior,
      model,
      created_at: '2026-08-31T12:00:00Z',
      updated_at: '2026-08-31T12:00:00Z',
    });
    const first = queued('queued_1', 3, 0);
    const second = queued('queued_2', 5, 1);
    const transport = new RecordingTransport([{ queued_messages: [second, first] }]);
    const repository = new ComposerRepository(transport);

    await expect(repository.reorderQueuedMessages('session_1', [second, first])).resolves.toEqual([
      second,
      first,
    ]);
    expect(transport.requests[0]).toMatchObject({
      method: 'POST',
      path: '/v1/sessions/session_1/queued-messages/reorder',
      body: {
        ordered_ids: ['queued_2', 'queued_1'],
        revisions: { queued_1: 3, queued_2: 5 },
      },
    });
  });

  it('uploads original bytes with resumable offset headers', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const transport = new RecordingTransport([undefined]);
    const repository = new ComposerRepository(transport);

    await repository.appendResourceBytes('workspace 1', 'resource 1', 8, bytes);

    expect(transport.requests[0]).toMatchObject({
      method: 'PATCH',
      path: '/v1/workspaces/workspace%201/resources/resource%201/content',
      headers: {
        'Content-Type': 'application/offset+octet-stream',
        'Upload-Offset': '8',
      },
      rawBody: bytes,
    });
  });

  it('binds resource creation to a stable client upload identity', async () => {
    const resource = {
      id: 'resource_1',
      workspace_id: 'workspace_1',
      client_upload_id: 'browser-abc',
      revision: 1,
      name: 'notes.md',
      claimed_mime: 'text/markdown',
      detected_mime: '',
      detection_source: '',
      declared_size: 12,
      received_size: 4,
      sha256: '',
      state: 'uploading',
      failure: '',
      created_at: '2026-08-31T12:00:00Z',
      updated_at: '2026-08-31T12:00:01Z',
      completed_at: '',
      mime_mismatch: false,
      idempotent_replay: true,
    };
    const transport = new RecordingTransport([resource]);
    const repository = new ComposerRepository(transport);

    await expect(
      repository.createResource('workspace_1', {
        clientUploadId: 'browser-abc',
        mediaType: 'text/markdown',
        name: 'notes.md',
        size: 12,
      }),
    ).resolves.toEqual(resource);
    expect(transport.requests[0]).toMatchObject({
      method: 'POST',
      body: {
        client_upload_id: 'browser-abc',
        media_type: 'text/markdown',
        name: 'notes.md',
        size: 12,
      },
    });
  });

  it('decodes live catalog evidence without blending providers into models', async () => {
    const catalog = {
      authoritative: 'live_handshake',
      providers: [
        {
          id: 'local-vllm',
          name: 'Local vLLM',
          kind: 'openai_compatible',
          endpoint: 'http://127.0.0.1:8000/v1',
          configuration_url: '/settings/providers/local-vllm',
          connectivity: 'reachable',
          auth: 'not_required',
          health: 'ready',
          freshness: { generated_at: '2026-08-31T12:00:00Z', source: 'live' },
          failure: '',
          models: [
            {
              provider_id: 'local-vllm',
              provider_kind: 'openai_compatible',
              endpoint: 'http://127.0.0.1:8000/v1',
              deployment: 'local',
              model_id: 'Qwen/Qwen3-VL-32B',
              revision: '7',
              modalities: ['image', 'text'],
              reasoning: { supported: true, parameter: 'reasoning_effort' },
              native_tool_calling: true,
              context_window: 131072,
              availability: 'available',
              evidence: {
                source: 'live',
                generated_at: '2026-08-31T12:00:00Z',
                live: true,
                context_source: 'provider',
              },
              failure: '',
            },
          ],
        },
      ],
    };
    const transport = new RecordingTransport([catalog]);
    const repository = new ComposerRepository(transport);

    await expect(repository.providerCatalog(true)).resolves.toEqual(catalog);
    expect(transport.requests[0]).toMatchObject({
      method: 'GET',
      path: '/v1/provider-catalog?refresh=true',
    });
  });

  it('loads bounded previews and structured-document views from resource custody', async () => {
    const processing = {
      workspace_id: 'workspace_1',
      resource_id: 'resource_1',
      resource_revision: 2,
      source_sha256: 'abc123',
      processor: 'docling',
      processor_url: 'http://127.0.0.1:8030',
      job_id: 'job_1',
      state: 'complete',
      progress: 100,
      failure: {},
      created_at: '2026-08-31T12:00:00Z',
      updated_at: '2026-08-31T12:01:00Z',
    };
    const preview = new Uint8Array([35, 32, 84, 105, 116, 108, 101]);
    const transport = new RecordingTransport([
      preview,
      {
        resource_id: 'resource_1',
        revision: 2,
        derivatives: [
          {
            id: 'markdown',
            name: 'report.md',
            media_type: 'text/markdown',
            kind: 'markdown',
            size: 7,
            content_url:
              '/v1/workspaces/workspace_1/resources/resource_1/derivatives/markdown/content',
          },
        ],
        processor: processing,
      },
      {
        resource_id: 'resource_1',
        revision: 2,
        collections: { pages: 4, tables: 1 },
      },
      { collection: 'tables', index: 0, node: { data: [['value']] } },
    ]);
    const repository = new ComposerRepository(transport);

    await expect(repository.resourcePreview('workspace_1', 'resource_1')).resolves.toEqual(preview);
    await expect(repository.resourceDerivatives('workspace_1', 'resource_1')).resolves.toMatchObject({
      processor: { state: 'complete' },
      derivatives: [{ id: 'markdown', media_type: 'text/markdown' }],
    });
    await expect(repository.resourceStructure('workspace_1', 'resource_1')).resolves.toMatchObject({
      collections: { pages: 4, tables: 1 },
    });
    await expect(
      repository.resourceStructureNode('workspace_1', 'resource_1', 'tables', 0),
    ).resolves.toEqual({ collection: 'tables', index: 0, node: { data: [['value']] } });

    expect(
      transport.requests.map(({ path, responseType }) => ({ path, responseType })),
    ).toEqual([
      {
        path: '/v1/workspaces/workspace_1/resources/resource_1/preview',
        responseType: 'bytes',
      },
      {
        path: '/v1/workspaces/workspace_1/resources/resource_1/derivatives',
        responseType: undefined,
      },
      {
        path: '/v1/workspaces/workspace_1/resources/resource_1/structure',
        responseType: undefined,
      },
      {
        path: '/v1/workspaces/workspace_1/resources/resource_1/structure/tables/0',
        responseType: undefined,
      },
    ]);
  });

  it('searches, reprocesses, and exposes immutable resource delivery provenance', async () => {
    const processing = {
      workspace_id: 'workspace_1',
      resource_id: 'resource_1',
      resource_revision: 1,
      source_sha256: 'abc123',
      processor: 'docling',
      processor_url: '',
      job_id: '',
      state: 'submitted',
      progress: 0,
      failure: {},
      created_at: '2026-08-31T12:00:00Z',
      updated_at: '2026-08-31T12:00:00Z',
    };
    const delivery = {
      id: 'rdl_1',
      workspace_id: 'workspace_1',
      resource_id: 'resource_1',
      resource_revision: 1,
      resource_sha256: 'abc123',
      message_id: 'message_1',
      provider_id: 'ollama',
      model_id: 'qwen3',
      representation: 'bounded_tools',
      evidence_source: 'live_handshake',
      evidence_generated_at: '2026-08-31T11:59:00Z',
      reason: 'Model is text only.',
      delivered_at: '2026-08-31T12:01:00Z',
    };
    const transport = new RecordingTransport([
      {
        resource_id: 'resource_1',
        query: 'station',
        matches: [{ line: 7, text: 'MTA1 station' }],
        truncated: false,
      },
      processing,
      { records: [delivery] },
    ]);
    const repository = new ComposerRepository(transport);

    await expect(repository.searchResource('workspace_1', 'resource_1', 'station')).resolves.toMatchObject({
      matches: [{ line: 7 }],
    });
    await expect(repository.reprocessResource('workspace_1', 'resource_1')).resolves.toEqual(
      processing,
    );
    await expect(repository.resourceDeliveries('workspace_1')).resolves.toEqual([delivery]);

    expect(transport.requests.map(({ method, path }) => ({ method, path }))).toEqual([
      {
        method: 'GET',
        path: '/v1/workspaces/workspace_1/resources/resource_1/search?q=station',
      },
      {
        method: 'POST',
        path: '/v1/workspaces/workspace_1/resources/resource_1/reprocess',
      },
      { method: 'GET', path: '/v1/workspaces/workspace_1/resource-deliveries' },
    ]);
  });
});
