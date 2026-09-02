import { beforeEach, describe, expect, it } from 'vitest';
import { ComposerRepository } from './composer-repository.js';
import { QueuedMessageReorderConflictError } from './composer-conflicts.js';
import { clearComposerRowDegradations, composerRowDegradations } from './composer-decoding.js';
import type { QueuedMessage } from './composer-domain.js';
import { RecordingTransport } from './recording-transport.test-helper.js';
import { TransportError } from './transport.js';

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

  it('surfaces a reorder conflict with the latest server order instead of resubmitting', async () => {
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
    const staleFirst = queued('queued_1', 1, 0);
    const staleSecond = queued('queued_2', 1, 1);
    // A concurrent writer added a row and bumped both revisions between the
    // read the drag started from and the reorder POST.
    const serverOnly = queued('queued_server', 2, 0);
    const latestFirst = queued('queued_1', 3, 1);
    const latestSecond = queued('queued_2', 4, 2);
    const transport = new RecordingTransport([
      new TransportError('queued message revision conflict', 409),
      { queued_messages: [serverOnly, latestFirst, latestSecond] },
    ]);
    const repository = new ComposerRepository(transport);

    const conflict = await repository
      .reorderQueuedMessages('session_1', [staleSecond, staleFirst])
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    expect(conflict).toBeInstanceOf(QueuedMessageReorderConflictError);
    expect(conflict).toMatchObject({
      reason: 'queued_messages_changed',
      queuedMessages: [serverOnly, latestFirst, latestSecond],
    });
    // The stale order is never replayed over the concurrent writer's change.
    expect(transport.requests.map((request) => request.method)).toEqual(['POST', 'GET']);
  });

  it('reports a reorder conflict even when the server order already matches the drag', async () => {
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
    const transport = new RecordingTransport([
      new TransportError('queued message reorder set does not match server state', 409),
      { queued_messages: [] },
    ]);
    const repository = new ComposerRepository(transport);

    // The drag targeted a message the service had already consumed. Resolving
    // here would report a successful reorder that never happened.
    await expect(
      repository.reorderQueuedMessages('session_1', [queued('queued_1', 1, 0)]),
    ).rejects.toBeInstanceOf(QueuedMessageReorderConflictError);
    expect(transport.requests.map((request) => request.method)).toEqual(['POST', 'GET']);
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
              loaded_context_window: null,
              output_limit: null,
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

    await expect(repository.providerCatalog(true)).resolves.toEqual({
      ...catalog,
      providers: [
        {
          ...catalog.providers[0]!,
          models: [
            {
              ...catalog.providers[0]!.models[0]!,
              loaded_context_window: undefined,
              output_limit: undefined,
            },
          ],
        },
      ],
    });
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
      cancellation: {},
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
    await expect(
      repository.resourceDerivatives('workspace_1', 'resource_1'),
    ).resolves.toMatchObject({
      processor: { state: 'complete' },
      derivatives: [{ id: 'markdown', media_type: 'text/markdown' }],
    });
    await expect(repository.resourceStructure('workspace_1', 'resource_1')).resolves.toMatchObject({
      collections: { pages: 4, tables: 1 },
    });
    await expect(
      repository.resourceStructureNode('workspace_1', 'resource_1', 'tables', 0),
    ).resolves.toEqual({ collection: 'tables', index: 0, node: { data: [['value']] } });

    expect(transport.requests.map(({ path, responseType }) => ({ path, responseType }))).toEqual([
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
      derivatives_available: false,
      failure: {},
      cancellation: {},
      query_tool: 'workspace_resource_inspect',
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
      { ...processing, state: 'cancelled' },
      { records: [delivery] },
    ]);
    const repository = new ComposerRepository(transport);

    await expect(
      repository.searchResource('workspace_1', 'resource_1', 'station'),
    ).resolves.toMatchObject({
      matches: [{ line: 7 }],
    });
    await expect(repository.reprocessResource('workspace_1', 'resource_1')).resolves.toEqual(
      processing,
    );
    await expect(
      repository.cancelResourceProcessing('workspace_1', 'resource_1'),
    ).resolves.toMatchObject({ state: 'cancelled' });
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
      {
        method: 'POST',
        path: '/v1/workspaces/workspace_1/resources/resource_1/processing/cancel',
      },
      { method: 'GET', path: '/v1/workspaces/workspace_1/resource-deliveries' },
    ]);
  });
});

describe('ComposerRepository decode hygiene', () => {
  beforeEach(() => clearComposerRowDegradations());

  it('refuses a promotion the service did not name a queued message in', async () => {
    const transport = new RecordingTransport([
      {
        acceptance: {
          message_id: 'message_1',
          accepted_at: '2026-08-31T12:00:00Z',
          delivery: 'start',
          state: 'started',
          effective_model: model,
          behavior,
          idempotent_replay: false,
        },
      },
    ]);
    const repository = new ComposerRepository(transport);

    await expect(
      repository.promoteQueuedMessage('session_1', 'queued_1', 1, 'start'),
    ).rejects.toThrow();
  });

  it('carries the promotion the service did answer with', async () => {
    const transport = new RecordingTransport([
      {
        queued_message_id: 'queued_1',
        status_code: 202,
        acceptance: {
          message_id: 'message_1',
          accepted_at: '2026-08-31T12:00:00Z',
          delivery: 'start',
          state: 'started',
          effective_model: model,
          behavior,
          idempotent_replay: false,
        },
      },
    ]);
    const repository = new ComposerRepository(transport);

    await expect(
      repository.promoteQueuedMessage('session_1', 'queued_1', 1, 'start'),
    ).resolves.toMatchObject({ queued_message_id: 'queued_1', status_code: 202 });
  });

  it('refuses a steer cancellation and a structure node the service reshaped', async () => {
    const transport = new RecordingTransport([
      { session_id: 'session_1' },
      { collection: 'tables', node: { data: [] } },
    ]);
    const repository = new ComposerRepository(transport);

    await expect(repository.cancelPendingSteer('session_1', 'message_1')).rejects.toThrow();
    await expect(
      repository.resourceStructureNode('workspace_1', 'resource_1', 'tables', 0),
    ).rejects.toThrow();
  });

  it('degrades one unreadable queued row instead of the whole queue', async () => {
    const readable = {
      id: 'queued_1',
      session_id: 'session_1',
      revision: 1,
      position: 0,
      parts: [{ type: 'text', text: 'Keep me.' }],
      metadata: {},
      client_message_id: 'queued_1',
      idempotency_key: 'queued_1',
      behavior,
      model,
      created_at: '2026-08-31T12:00:00Z',
      updated_at: '2026-08-31T12:00:00Z',
    };
    const transport = new RecordingTransport([
      { queued_messages: [{ id: 'queued_0', session_id: 'session_1' }, readable] },
    ]);
    const repository = new ComposerRepository(transport);

    await expect(repository.queuedMessages('session_1')).resolves.toMatchObject([
      { id: 'queued_1' },
    ]);
    expect(composerRowDegradations()).toMatchObject([
      { collection: 'queued_messages', code: 'row_decode_failed', index: 0, id: 'queued_0' },
    ]);
  });

  it('degrades one unreadable resource, steer, and delivery row in place', async () => {
    const steer = {
      message_id: 'message_1',
      session_id: 'session_1',
      accepted_at: '2026-08-31T12:00:00Z',
      behavior,
      model,
    };
    const resource = {
      id: 'resource_1',
      workspace_id: 'workspace_1',
      name: 'observations.csv',
      declared_size: 2048,
      created_at: '2026-08-31T12:00:00Z',
      updated_at: '2026-08-31T12:00:00Z',
    };
    const transport = new RecordingTransport([
      { pending_steers: [steer, { session_id: 'session_1' }] },
      { resources: [{ id: 'resource_0' }, resource] },
      { records: [{ id: 'rdl_0' }] },
    ]);
    const repository = new ComposerRepository(transport);

    // A steer that has not been claimed, consumed, or cancelled decodes with
    // those stamps at the service's own empty default.
    await expect(repository.pendingSteers('session_1')).resolves.toMatchObject([
      { message_id: 'message_1', state: 'pending', claimed_at: '', cancelled_at: '' },
    ]);
    // An uploading resource likewise carries every detection field empty.
    await expect(repository.resources('workspace_1')).resolves.toMatchObject([
      { id: 'resource_1', state: 'uploading', detected_mime: '', completed_at: '', revision: 1 },
    ]);
    await expect(repository.resourceDeliveries('workspace_1')).resolves.toEqual([]);

    expect(composerRowDegradations().map(({ collection, index }) => ({ collection, index }))).toEqual(
      [
        { collection: 'pending_steers', index: 1 },
        { collection: 'resources', index: 0 },
        { collection: 'resource_deliveries', index: 0 },
      ],
    );
  });

  it('still fails the whole read when the service serves no list at all', async () => {
    const transport = new RecordingTransport([{ queued_messages: null }]);
    const repository = new ComposerRepository(transport);

    await expect(repository.queuedMessages('session_1')).rejects.toThrow(
      /Expected an array of queued_messages/u,
    );
  });
});
