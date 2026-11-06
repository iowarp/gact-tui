import { z } from 'zod';
import { readBytesPath } from './artifact-custody.js';
import type {
  CommentMarkInput,
  CommentTarget,
  CommentThreadList,
  SentCommentSession,
} from './comment-domain.js';
import type { ArtifactReview } from './document-domain.js';
import { artifactReviewSchema, DocumentRepository } from './document-repository.js';

const commentTargetSchema = z.object({
  artifact_id: z.string(),
  name: z.string(),
  workspace_id: z.string(),
  version: z.number().int().positive(),
  sha256: z.string(),
  path: z.string().default(''),
  producer: z.record(z.string(), z.unknown()).default({}),
});
const threadListSchema = z.object({
  artifact_id: z.string(),
  head: commentTargetSchema,
  next_label: z.string(),
  threads: z.array(artifactReviewSchema),
});
const sentSessionSchema = z.object({
  session_key: z.string(),
  message_id: z.string().default(''),
  threads: z.array(artifactReviewSchema),
});

/** Comment sessions, drafts, threads and workspace-file comment targets (comments plan). */
export class CommentRepository extends DocumentRepository {
  /** The artifact version a workspace file is, or `undefined` when it is not one yet. */
  public async commentTarget(
    workspaceId: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<CommentTarget | null> {
    const result = await this.transport.request({
      method: 'GET',
      path: `/v1/workspaces/${encodeURIComponent(workspaceId)}/comment-targets?path=${encodeURIComponent(path)}`,
      decode: (value) => z.object({ artifact: commentTargetSchema.nullable() }).parse(value),
      signal,
    });
    // null, not undefined, for a file with no artifact yet: query caches refuse undefined.
    return result.artifact;
  }

  /** Register a workspace file as an artifact version so it can hold comment threads. */
  public async createCommentTarget(
    workspaceId: string,
    input: { path: string; session_id: string },
    signal?: AbortSignal,
  ): Promise<CommentTarget> {
    const result = await this.transport.request({
      method: 'POST',
      path: `/v1/workspaces/${encodeURIComponent(workspaceId)}/comment-targets`,
      body: input,
      decode: (value) => z.object({ artifact: commentTargetSchema }).parse(value),
      signal,
    });
    return result.artifact;
  }

  /** The artifact's threads, re-anchored to its newest version. */
  public async commentThreads(
    artifactId: string,
    sessionId?: string,
    signal?: AbortSignal,
  ): Promise<CommentThreadList> {
    const query = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
    const result = await this.transport.request({
      method: 'GET',
      path: `/v1/artifacts/${encodeURIComponent(artifactId)}/threads${query}`,
      decode: (value) => threadListSchema.parse(value),
      signal,
    });
    return result as CommentThreadList;
  }

  /** Keep unsent marks as the draft on one artifact version. */
  public async saveCommentDrafts(
    artifactId: string,
    input: {
      session_id: string;
      expected_version: number;
      expected_sha256: string;
      marks: CommentMarkInput[];
    },
    signal?: AbortSignal,
  ): Promise<ArtifactReview[]> {
    const result = await this.transport.request({
      method: 'PUT',
      path: `/v1/artifacts/${encodeURIComponent(artifactId)}/comment-drafts`,
      body: input,
      decode: (value) => z.object({ drafts: z.array(artifactReviewSchema) }).parse(value),
      signal,
    });
    return result.drafts as ArtifactReview[];
  }

  /** Send one select session's marks on an artifact version as one agent turn. */
  public async sendCommentSession(
    sessionId: string,
    input: {
      artifact_id: string;
      expected_version: number;
      expected_sha256: string;
      marks: CommentMarkInput[];
      idempotency_key: string;
      allow_historical?: boolean;
    },
    signal?: AbortSignal,
  ): Promise<SentCommentSession> {
    const result = await this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/comment-sessions`,
      body: input,
      decode: (value) => sentSessionSchema.parse(value),
      signal,
    });
    return result as SentCommentSession;
  }

  /** A region or element thread's crop (PNG) on its own version or on the newest one. */
  public commentCrop(
    threadId: string,
    side: 'before' | 'after',
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    return readBytesPath(
      this.transport,
      `/v1/document-threads/${encodeURIComponent(threadId)}/crop?side=${side}`,
      signal,
    );
  }
}
