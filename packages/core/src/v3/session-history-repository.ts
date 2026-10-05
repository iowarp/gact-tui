import { z } from 'zod';
import type { Session } from './domain.js';
import { sessionSchema } from './schemas.js';
import type { ClioTransport } from './transport.js';
import { captureSessionReview, type SessionExportMode } from './session-export-snapshot.js';

const rollbackResultSchema = z.object({
  session_id: z.string(),
  operation: z.enum(['undo', 'rewind']),
  deleted_message_ids: z.array(z.string()).default([]),
  message_count: z.number().int().nonnegative(),
});
const compactResultSchema = z.object({
  session_id: z.string(),
  compacted: z.boolean(),
  reason: z.string().optional(),
  summary_message_id: z.string().optional(),
});
const shareResultSchema = z.object({
  token: z.string(),
  session_id: z.string(),
  url: z.string(),
  expires_at: z.union([z.string(), z.number()]),
});

/** Session branching, portability, and destructive history workflows. */
export class SessionHistoryRepository {
  public constructor(protected readonly transport: ClioTransport) {}

  /** Read the authoritative session, including its parent and current behavior. */
  public session(sessionId: string, workspaceId: string, signal?: AbortSignal): Promise<Session> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}?workspace_id=${encodeURIComponent(workspaceId)}`,
      decode: (value) => sessionSchema.parse(value),
      signal,
    });
  }

  public exportSession(sessionId: string, signal?: AbortSignal): Promise<unknown> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/export`,
      decode: (value) => value,
      signal,
    });
  }

  /** Save an offline visual review with optional effect/workspace payloads. */
  public async prepareSessionArchive(
    sessionId: string,
    mode: SessionExportMode,
    renderer: { javascript: string; stylesheet: string },
  ): Promise<{ download_path: string; filename: string }> {
    const raw = (await this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/export-review`,
      decode: (value) => value,
    })) as {
      children?: { session: { id: string } }[];
    };
    const snapshot = await captureSessionReview(
      this.transport,
      [sessionId, ...(raw.children ?? []).map((row) => row.session.id)],
      raw,
    );
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/export-download`,
      body: { mode, visual_review: { ...renderer, snapshot } },
      timeoutMs: 30 * 60 * 1000,
      decode: (value) => {
        return z
          .object({
            download_path: z.string().regex(/^\/v1\/session-export-downloads\/[a-f0-9]{64}$/u),
            filename: z.string(),
          })
          .parse(value);
      },
    });
  }

  public importSession(value: unknown, signal?: AbortSignal): Promise<Session> {
    return this.transport.request({
      method: 'POST',
      path: '/v1/sessions/import',
      body: value,
      decode: (response) => sessionSchema.parse(response),
      signal,
    });
  }

  public forkSession(
    sessionId: string,
    input: { at_message_id?: string; title?: string } = {},
    signal?: AbortSignal,
  ): Promise<Session> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/fork`,
      body: input,
      decode: (value) => sessionSchema.parse(value),
      signal,
    });
  }

  /**
   * Open a read-only side conversation on `sessionId`, carrying its context
   * (clio-agent `POST /v1/sessions/{sid}/side-sessions`). The aside can only
   * run tools that declare no side effects and never writes to the parent; it
   * replaces any earlier aside of the same parent and is closed with
   * `deleteSession`.
   */
  public openSideSession(
    sessionId: string,
    selection: { text: string; message_id: string },
    signal?: AbortSignal,
  ): Promise<Session> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/side-sessions`,
      body: { selection },
      decode: (value) => sessionSchema.parse(value),
      signal,
    });
  }

  public undoSession(sessionId: string, count = 1, signal?: AbortSignal) {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/undo`,
      body: { count },
      decode: (value) => rollbackResultSchema.parse(value),
      signal,
    });
  }

  public rewindSession(
    sessionId: string,
    messageId: string,
    includeTarget = false,
    signal?: AbortSignal,
  ) {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/rewind`,
      body: { message_id: messageId, include_target: includeTarget },
      decode: (value) => rollbackResultSchema.parse(value),
      signal,
    });
  }

  /**
   * Compacts a session's context. `scope` names one agent's working context
   * (the context panel's selected agent); without it the service compacts the
   * session's main conversation. Progress and the resulting summary arrive on
   * the live stream as `compaction.*` events and a `summarization` injection.
   */
  public compactSession(sessionId: string, scope?: string, signal?: AbortSignal) {
    const query = scope ? `?scope=${encodeURIComponent(scope)}` : '';
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/compact${query}`,
      body: {},
      decode: (value) => compactResultSchema.passthrough().parse(value),
      signal,
    });
  }

  public shareSession(sessionId: string, ttlSeconds: number, signal?: AbortSignal) {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/share`,
      body: { ttl_s: ttlSeconds },
      decode: (value) => shareResultSchema.parse(value),
      signal,
    });
  }
}
