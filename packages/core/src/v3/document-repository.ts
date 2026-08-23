import { z } from 'zod';
import type {
  ArtifactReview,
  DocumentEditorHealth,
  DocumentEditorSession,
  DocumentManifest,
  DocumentRendition,
  DocumentWorkingCopy,
  SubmitArtifactReviewInput,
} from './document-domain.js';
import { readBytesPath } from './artifact-custody.js';
import { BlueprintRepository } from './blueprint-repository.js';

const optionalString = z
  .string()
  .nullish()
  .transform((value) => value || undefined);
const anchorProfileSchema = z.enum([
  'text-quote',
  'pdf-quad',
  'dom',
  'sheet-range',
  'slide-shape',
  'native-comment',
  'source-map',
]);
const documentAnchorSchema = z.object({
  profile: anchorProfileSchema,
  exact: optionalString,
  prefix: optionalString,
  suffix: optionalString,
  source_path: optionalString,
  start: z.number().int().nonnegative().nullish().transform((value) => value ?? undefined),
  end: z.number().int().nonnegative().nullish().transform((value) => value ?? undefined),
  page_index: z.number().int().nonnegative().nullish().transform((value) => value ?? undefined),
  quads: z.array(z.array(z.number())).optional(),
  selector: optionalString,
  stable_id: optionalString,
  sheet: optionalString,
  cell_range: optionalString,
  slide_id: optionalString,
  shape_id: optionalString,
  native_comment_id: optionalString,
  source: z.record(z.string(), z.unknown()).default({}),
});
const documentManifestSchema = z.object({
  artifact_id: z.string(),
  workspace_id: z.string(),
  name: z.string(),
  version: z.number().int().positive(),
  sha256: z.string(),
  mime_type: z.string(),
  profile: z.enum([
    'markdown',
    'pdf',
    'latex',
    'html-static',
    'ooxml-word',
    'ooxml-sheet',
    'ooxml-slides',
    'odf-text',
    'odf-sheet',
    'odf-slides',
    'binary',
  ]),
  content_url: z.string(),
  anchors: z.array(anchorProfileSchema).default([]),
  native_open: z.boolean(),
  embedded_editors: z.array(z.enum(['onlyoffice', 'collabora'])).default([]),
  rendition_formats: z.array(z.string()).default([]),
  provenance: z.record(z.string(), z.unknown()).default({}),
});
const artifactReviewSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  workspace_id: z.string(),
  artifact_id: z.string(),
  artifact_name: z.string(),
  artifact_version: z.number().int().positive(),
  artifact_sha256: z.string(),
  anchor: documentAnchorSchema,
  text: z.string(),
  status: z.enum(['queued', 'dispatched', 'human-note', 'failed', 'stale']),
  native: z.boolean().default(false),
  native_text_hash: optionalString,
  idempotency_key: optionalString,
  message_id: optionalString,
  created_at: z.string(),
  error: optionalString,
});
const workingCopySchema = z.object({
  id: z.string(),
  session_id: z.string(),
  workspace_id: z.string(),
  artifact_name: z.string(),
  base_artifact_id: z.string(),
  head_artifact_id: z.string(),
  base_version: z.number().int().positive(),
  head_version: z.number().int().positive(),
  base_sha256: z.string(),
  last_sha256: z.string(),
  path: z.string(),
  provider: z.enum(['native', 'onlyoffice', 'collabora']),
  writable: z.boolean(),
  auto_checkpoint: z.boolean(),
  status: z.enum(['active', 'conflict', 'closed', 'missing', 'error']),
  created_at: z.string(),
  updated_at: z.string(),
  last_checkpoint_at: optionalString,
  conflict_head_artifact_id: optionalString,
  conflict_candidate_sha256: optionalString,
  error: optionalString,
  native_comment_fingerprints: z.array(z.string()).default([]),
});
const editorSessionSchema = z.object({
  id: z.string(),
  working_copy_id: z.string(),
  provider: z.enum(['onlyoffice', 'collabora']),
  status: z.enum(['ready', 'unavailable', 'closed']),
  editor_url: optionalString,
  token: optionalString,
  expires_at: optionalString,
  config: z.record(z.string(), z.unknown()).default({}),
  error: optionalString,
});
const editorHealthSchema = z.object({
  editors: z.array(
    z.object({
      provider: z.enum(['onlyoffice', 'collabora']),
      url: z.string().default(''),
      configured: z.boolean(),
      healthy: z.boolean(),
      error: optionalString,
    }),
  ),
});

/** Immutable document review, rendition, and working-copy workflows. */
export class DocumentRepository extends BlueprintRepository {
  public documentManifest(artifactId: string, signal?: AbortSignal): Promise<DocumentManifest> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/artifacts/${encodeURIComponent(artifactId)}/document`,
      decode: (value) => documentManifestSchema.parse(value) as DocumentManifest,
      signal,
    });
  }

  public documentContent(artifactId: string, signal?: AbortSignal): Promise<Uint8Array> {
    return readBytesPath(
      this.transport,
      `/v1/artifacts/${encodeURIComponent(artifactId)}/document/content`,
      signal,
    );
  }

  public async artifactReviews(
    artifactId: string,
    signal?: AbortSignal,
  ): Promise<ArtifactReview[]> {
    const result = await this.transport.request({
      method: 'GET',
      path: `/v1/artifacts/${encodeURIComponent(artifactId)}/reviews`,
      decode: (value) => z.object({ reviews: z.array(artifactReviewSchema) }).parse(value),
      signal,
    });
    return result.reviews as ArtifactReview[];
  }

  public submitArtifactReview(
    sessionId: string,
    input: SubmitArtifactReviewInput,
    signal?: AbortSignal,
  ): Promise<ArtifactReview> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/artifact-reviews`,
      body: input,
      decode: (value) => artifactReviewSchema.parse(value) as ArtifactReview,
      signal,
    });
  }

  public createDocumentRendition(
    artifactId: string,
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<DocumentRendition> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/artifacts/${encodeURIComponent(artifactId)}/renditions?session_id=${encodeURIComponent(sessionId)}`,
      body: { format: 'pdf' },
      decode: (value) =>
        z
          .object({
            source_artifact_id: z.string(),
            converter: z.string(),
            artifact: documentManifestSchema,
          })
          .parse(value) as DocumentRendition,
      signal,
    });
  }

  public createDocumentWorkingCopy(
    artifactId: string,
    input: {
      session_id: string;
      provider: 'native' | 'onlyoffice' | 'collabora';
      writable?: boolean;
      auto_checkpoint?: boolean;
    },
    signal?: AbortSignal,
  ): Promise<DocumentWorkingCopy> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/artifacts/${encodeURIComponent(artifactId)}/working-copies`,
      body: input,
      decode: (value) => workingCopySchema.parse(value) as DocumentWorkingCopy,
      signal,
    });
  }

  public documentWorkingCopy(
    workingCopyId: string,
    signal?: AbortSignal,
  ): Promise<DocumentWorkingCopy> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/document-working-copies/${encodeURIComponent(workingCopyId)}`,
      decode: (value) => workingCopySchema.parse(value) as DocumentWorkingCopy,
      signal,
    });
  }

  public closeDocumentWorkingCopy(
    workingCopyId: string,
    signal?: AbortSignal,
  ): Promise<DocumentWorkingCopy> {
    return this.transport.request({
      method: 'DELETE',
      path: `/v1/document-working-copies/${encodeURIComponent(workingCopyId)}`,
      decode: (value) => workingCopySchema.parse(value) as DocumentWorkingCopy,
      signal,
    });
  }

  public resolveDocumentConflict(
    workingCopyId: string,
    input: {
      resolution: 'keep-current' | 'use-working-copy';
      expected_head_artifact_id: string;
    },
    signal?: AbortSignal,
  ): Promise<DocumentWorkingCopy> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/document-working-copies/${encodeURIComponent(workingCopyId)}/conflict`,
      body: input,
      decode: (value) => workingCopySchema.parse(value) as DocumentWorkingCopy,
      signal,
    });
  }

  public documentEditorHealth(signal?: AbortSignal): Promise<DocumentEditorHealth> {
    return this.transport.request({
      method: 'GET',
      path: '/v1/document-editors/health',
      decode: (value) => editorHealthSchema.parse(value) as DocumentEditorHealth,
      signal,
    });
  }

  public createDocumentEditorSession(
    workingCopyId: string,
    provider: 'onlyoffice' | 'collabora',
    signal?: AbortSignal,
  ): Promise<DocumentEditorSession> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/document-working-copies/${encodeURIComponent(workingCopyId)}/editor-sessions`,
      body: { provider },
      decode: (value) => editorSessionSchema.parse(value) as DocumentEditorSession,
      signal,
    });
  }
}
