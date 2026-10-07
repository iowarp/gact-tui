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

/** Read captured responses and query captured tables; never contacts a live service. */
export class ArchiveTransport implements ClioTransport {
  public constructor(private readonly snapshot: SessionReviewSnapshot) {}
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
    if (request.method !== 'GET')
      throw new TransportError(
        'This is an offline review. Agent actions need a live session.',
        409,
        'archive_read_only',
      );
    const response = this.snapshot.responses[sessionReviewRequestKey(request.method, request.path)];
    if (!response)
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
      response.bytes === undefined
        ? response.json
        : Uint8Array.from(atob(response.bytes), (c) => c.charCodeAt(0));
    if (request.responseType === 'text' && value instanceof Uint8Array)
      value = new TextDecoder().decode(value);
    return request.decode(value);
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
