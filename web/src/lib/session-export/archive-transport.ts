import {
  TransportError,
  sessionReviewRequestKey,
  type ClioTransport,
  type TransportRequest,
  type SessionReviewSnapshot,
  type ArtifactTableQueryResult,
  type ArtifactTableQueryRequest,
} from '@clio/core/v3';
import { queryArchiveTable } from './archive-table-query';

/**
 * The transcripts an archive already carries, so a read of a session's
 * messages is answered from them instead of from a second captured copy:
 * `views` are the projected transcripts the conversation renders.
 */
export interface ArchiveTranscripts {
  views?: Readonly<
    Record<
      string,
      {
        messages: unknown[];
        tools?: unknown[];
        tasks?: unknown[];
        subagents?: unknown[];
        artifacts?: unknown[];
        surfaces?: unknown[];
      }
    >
  >;
}

const MESSAGES_PATH = /^\/v1\/sessions\/([^/?]+)\/messages$/u;

/** The text of a page's inert data block (a dashboard export's file bytes, base64). */
export type ArchiveBlockReader = (id: string) => string | null | undefined;

const pageBlock: ArchiveBlockReader = (id) =>
  typeof document === 'undefined' ? undefined : document.getElementById(id)?.textContent;

function decodeBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

/** Read captured responses and query captured tables; never contacts a live service. */
export class ArchiveTransport implements ClioTransport {
  /** Each embedded file is decoded once, on its first read. */
  private readonly embedded = new Map<string, Uint8Array>();

  public constructor(
    private readonly snapshot: SessionReviewSnapshot,
    private readonly transcripts: ArchiveTranscripts = {},
    private readonly block: ArchiveBlockReader = pageBlock,
  ) {}
  public async request<T>(request: TransportRequest<T>): Promise<T> {
    const match = request.path.match(/^\/v1\/artifacts\/([^/]+)\/table-query$/u);
    if (request.method === 'POST' && match && this.snapshot.tables[decodeURIComponent(match[1])]) {
      return request.decode(
        queryArchiveTable(
          this.snapshot.tables[decodeURIComponent(match[1])] as unknown as ArtifactTableQueryResult,
          request.body as ArtifactTableQueryRequest,
        ),
      );
    }
    const study = request.path.match(/^\/v1\/studies\/([^/]+)\/table-query$/u);
    const studyBody = request.body as (ArtifactTableQueryRequest & { source?: string }) | undefined;
    const studyTable = study
      ? this.snapshot.tables[`study://${decodeURIComponent(study[1]!)}/${studyBody?.source ?? ''}`]
      : undefined;
    // A study source answers as it stood at export: the archive holds no later entries.
    if (request.method === 'POST' && studyTable) {
      const { source: _source, ...query } = studyBody!;
      return request.decode(
        queryArchiveTable(studyTable as unknown as ArtifactTableQueryResult, query),
      );
    }
    if (request.method !== 'GET')
      throw new TransportError(
        'This is an offline review. Agent actions need a live session.',
        409,
        'archive_read_only',
      );
    const transcript = this.transcript(request);
    if (transcript !== undefined) return request.decode(transcript);
    let key = sessionReviewRequestKey(request.method, request.path);
    let response = this.snapshot.responses[key];
    // A read stored once for several paths (a study read by each of its branches).
    for (let hops = 0; response?.same_as && hops < 4; hops += 1) {
      key = response.same_as;
      response = this.snapshot.responses[key];
    }
    if (!response || response.same_as)
      throw new TransportError(
        'This content was not captured in the archive. See export coverage.',
        404,
        'archive_content_unavailable',
      );
    if (response.error)
      throw new TransportError(
        response.error.message,
        response.error.status,
        response.error.code,
        response.error.details,
      );
    let value =
      response.embedded !== undefined
        ? this.embeddedBytes(response.embedded)
        : response.bytes === undefined
          ? response.json
          : decodeBase64(response.bytes);
    if (request.responseType === 'text' && value instanceof Uint8Array)
      value = new TextDecoder().decode(value);
    return request.decode(value);
  }

  /** A file the page carries as an inert base64 block (a dashboard export, #1823). */
  private embeddedBytes(id: string): Uint8Array {
    const cached = this.embedded.get(id);
    if (cached) return cached;
    const text = this.block(id);
    if (!text)
      throw new TransportError(
        'This file was not included in the exported page.',
        404,
        'archive_content_unavailable',
      );
    const bytes = decodeBase64(text);
    this.embedded.set(id, bytes);
    return bytes;
  }

  /** A session's messages, answered from the transcript the archive carries. */
  private transcript(request: TransportRequest<unknown>): unknown {
    const match = request.path.match(MESSAGES_PATH);
    if (!match) return undefined;
    const sessionId = decodeURIComponent(match[1]!);
    const view = this.transcripts.views?.[sessionId];
    if (!view) return undefined;
    return {
      messages: view.messages,
      tools: view.tools ?? [],
      tasks: view.tasks ?? [],
      subagents: view.subagents ?? [],
      artifacts: view.artifacts ?? [],
      surfaces: view.surfaces ?? [],
    };
  }

  public stream(): AsyncIterable<never> {
    return {
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          throw new TransportError(
            'An offline archive has no live activity stream.',
            409,
            'archive_read_only',
          );
        },
      }),
    };
  }
}
