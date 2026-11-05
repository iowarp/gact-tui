import { describe, expect, it } from 'vitest';
import { ClioRepository } from './repository.js';
import type { ClioTransport, StreamScope, TransportFrame, TransportRequest } from './transport.js';

class RecordingTransport implements ClioTransport {
  public readonly requests: TransportRequest<unknown>[] = [];

  public constructor(private readonly responses: unknown[]) {}

  public request<T>(request: TransportRequest<T>): Promise<T> {
    this.requests.push(request as TransportRequest<unknown>);
    return Promise.resolve(request.decode(this.responses.shift()));
  }

  public async *stream(
    _scope: StreamScope,
    _cursor?: string,
    _signal?: AbortSignal,
  ): AsyncIterable<TransportFrame> {
    return;
  }
}

const manifest = {
  artifact_id: 'artifact/3',
  workspace_id: 'workspace-1',
  name: 'evidence.md',
  version: 3,
  sha256: 'a'.repeat(64),
  mime_type: 'text/markdown',
  profile: 'markdown',
  content_url: '/v1/artifacts/artifact%2F3/document/content',
  anchors: ['text-quote'],
  native_open: true,
  rendition_formats: ['pdf'],
  pdf_rendition_artifact_id: 'artifact_pdf',
  provenance: { custody: 'managed' },
};

const review = {
  id: 'review-1',
  session_id: 'session/one',
  workspace_id: 'workspace-1',
  artifact_id: 'artifact/3',
  artifact_name: 'evidence.md',
  artifact_version: 3,
  artifact_sha256: 'a'.repeat(64),
  anchor: { profile: 'text-quote', exact: 'bounded claim' },
  text: 'State the evidence boundary.',
  status: 'dispatched',
  native: false,
  created_at: '2026-08-23T00:00:00Z',
};

const workingCopy = {
  id: 'copy/one',
  session_id: 'session/one',
  workspace_id: 'workspace-1',
  artifact_name: 'evidence.md',
  base_artifact_id: 'artifact/3',
  head_artifact_id: 'artifact/3',
  base_version: 3,
  head_version: 3,
  base_sha256: 'a'.repeat(64),
  last_sha256: 'a'.repeat(64),
  path: 'D:\\workspace\\.clio\\documents\\working-copies\\copy-one\\evidence.md',
  writable: true,
  auto_checkpoint: true,
  status: 'active',
  created_at: '2026-08-23T00:00:00Z',
  updated_at: '2026-08-23T00:00:00Z',
  native_comment_fingerprints: [],
};

describe('DocumentRepository', () => {
  it('binds content, comments, and renditions to immutable artifact identity', async () => {
    const bytes = new Uint8Array([37, 80, 68, 70]);
    const transport = new RecordingTransport([
      manifest,
      bytes,
      {
        artifact_id: 'artifact/3',
        head: {
          artifact_id: 'artifact/3',
          name: 'evidence.md',
          workspace_id: 'workspace-1',
          version: 3,
          sha256: 'a'.repeat(64),
        },
        next_label: 'S2',
        threads: [review],
      },
      { session_key: 'cs_1', message_id: 'msg_1', threads: [{ ...review, label: 'S2' }] },
      { source_artifact_id: 'artifact/3', converter: 'pandoc', artifact: manifest },
    ]);
    const repository = new ClioRepository(transport);

    await expect(repository.documentManifest('artifact/3')).resolves.toMatchObject({
      profile: 'markdown',
      version: 3,
      pdf_rendition_artifact_id: 'artifact_pdf',
    });
    await expect(repository.documentContent('artifact/3')).resolves.toEqual(bytes);
    await expect(repository.commentThreads('artifact/3', 'session/one')).resolves.toMatchObject({
      next_label: 'S2',
      threads: [{ anchor_state: 'current', send_to_agent: true }],
    });
    await expect(
      repository.sendCommentSession('session/one', {
        artifact_id: 'artifact/3',
        expected_version: 3,
        expected_sha256: 'a'.repeat(64),
        marks: [
          {
            label: 'S2',
            anchor: { profile: 'text-quote', exact: 'bounded claim' },
            comment: 'State the evidence boundary.',
          },
        ],
        idempotency_key: 'review-once',
      }),
    ).resolves.toMatchObject({ session_key: 'cs_1', threads: [{ label: 'S2' }] });
    await expect(
      repository.createDocumentRendition('artifact/3', 'session/one'),
    ).resolves.toMatchObject({ converter: 'pandoc', artifact: { artifact_id: 'artifact/3' } });

    expect(
      transport.requests.map(({ method, path, responseType }) => ({
        method,
        path,
        responseType,
      })),
    ).toEqual([
      {
        method: 'GET',
        path: '/v1/artifacts/artifact%2F3/document',
        responseType: undefined,
      },
      {
        method: 'GET',
        path: '/v1/artifacts/artifact%2F3/document/content',
        responseType: 'bytes',
      },
      {
        method: 'GET',
        path: '/v1/artifacts/artifact%2F3/threads?session_id=session%2Fone',
        responseType: undefined,
      },
      {
        method: 'POST',
        path: '/v1/sessions/session%2Fone/comment-sessions',
        responseType: undefined,
      },
      {
        method: 'POST',
        path: '/v1/artifacts/artifact%2F3/renditions?session_id=session%2Fone',
        responseType: undefined,
      },
    ]);
    expect(transport.requests[3]?.body).toMatchObject({
      artifact_id: 'artifact/3',
      expected_version: 3,
      expected_sha256: 'a'.repeat(64),
      marks: [{ label: 'S2', comment: 'State the evidence boundary.' }],
      idempotency_key: 'review-once',
    });
  });

  it('uses explicit working-copy and conflict routes', async () => {
    const conflict = {
      ...workingCopy,
      status: 'conflict',
      conflict_head_artifact_id: 'artifact/4',
    };
    const transport = new RecordingTransport([
      workingCopy,
      workingCopy,
      { ...workingCopy, status: 'closed' },
      conflict,
    ]);
    const repository = new ClioRepository(transport);

    await repository.createDocumentWorkingCopy('artifact/3', {
      session_id: 'session/one',
      writable: true,
      auto_checkpoint: true,
    });
    await repository.documentWorkingCopy('copy/one');
    await repository.closeDocumentWorkingCopy('copy/one');
    await repository.resolveDocumentConflict('copy/one', {
      resolution: 'keep-current',
      expected_head_artifact_id: 'artifact/4',
    });

    expect(transport.requests.map(({ method, path }) => ({ method, path }))).toEqual([
      { method: 'POST', path: '/v1/artifacts/artifact%2F3/working-copies' },
      { method: 'GET', path: '/v1/document-working-copies/copy%2Fone' },
      { method: 'DELETE', path: '/v1/document-working-copies/copy%2Fone' },
      { method: 'POST', path: '/v1/document-working-copies/copy%2Fone/conflict' },
    ]);
    expect(transport.requests[3]?.body).toEqual({
      resolution: 'keep-current',
      expected_head_artifact_id: 'artifact/4',
    });
  });
});

describe('comment targets', () => {
  it('reports a workspace file with no artifact as null, which query caches accept', async () => {
    const transport = new RecordingTransport([{ artifact: null }]);
    const repository = new ClioRepository(transport);
    await expect(repository.commentTarget('ws 1', 'figs/plot.png')).resolves.toBeNull();
    expect(transport.requests[0]?.path).toBe('/v1/workspaces/ws%201/comment-targets?path=figs%2Fplot.png');
  });
});
