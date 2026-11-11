import { z } from 'zod';
import type {
  DocumentManifest,
  DocumentRendition,
  DocumentWorkingCopy,
} from './document-domain.js';
import { readBytesPath } from './artifact-custody.js';
import { PluginRepository } from './plugin-repository.js';

/**
 * Budget for a document rendition. Unit: milliseconds.
 *
 * The service converts the document to PDF while this request is open, so the
 * wait is a document-processor conversion, not a read; a long report takes
 * minutes. It lives here rather than with the client's other tunables because
 * only this one call has that shape.
 */
const DOCUMENT_RENDITION_TIMEOUT_MS = 600_000;

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
  'region',
]);
export const documentAnchorSchema = z.object({
  profile: anchorProfileSchema,
  exact: optionalString,
  prefix: optionalString,
  suffix: optionalString,
  source_path: optionalString,
  start: z
    .number()
    .int()
    .nonnegative()
    .nullish()
    .transform((value) => value ?? undefined),
  end: z
    .number()
    .int()
    .nonnegative()
    .nullish()
    .transform((value) => value ?? undefined),
  page_index: z
    .number()
    .int()
    .nonnegative()
    .nullish()
    .transform((value) => value ?? undefined),
  quads: z.array(z.array(z.number())).optional(),
  selector: optionalString,
  stable_id: optionalString,
  sheet: optionalString,
  cell_range: optionalString,
  slide_id: optionalString,
  shape_id: optionalString,
  native_comment_id: optionalString,
  rect: z.array(z.number()).optional(),
  natural_width: z.number().nullish().transform((value) => value ?? undefined),
  natural_height: z.number().nullish().transform((value) => value ?? undefined),
  crop_asset: optionalString,
  tag: optionalString,
  text_excerpt: optionalString,
  html_excerpt: optionalString,
  src: optionalString,
  viewport_width: z.number().nullish().transform((value) => value ?? undefined),
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
    'image',
    'binary',
  ]),
  content_url: z.string(),
  anchors: z.array(anchorProfileSchema).default([]),
  native_open: z.boolean(),
  rendition_formats: z.array(z.string()).default([]),
  pdf_rendition_artifact_id: optionalString,
  provenance: z.record(z.string(), z.unknown()).default({}),
});
export const artifactReviewSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  workspace_id: z.string(),
  artifact_id: z.string(),
  artifact_name: z.string(),
  artifact_version: z.number().int().positive(),
  artifact_sha256: z.string(),
  anchor: documentAnchorSchema,
  text: z.string(),
  status: z.enum([
    'draft',
    'queued',
    'dispatched',
    'human-note',
    'failed',
    'stale',
    'discarded',
  ]),
  native: z.boolean().default(false),
  native_text_hash: optionalString,
  idempotency_key: optionalString,
  message_id: optionalString,
  created_at: z.string(),
  error: optionalString,
  label: optionalString,
  session_key: optionalString,
  send_to_agent: z.boolean().default(true),
  reply_text: optionalString,
  reply_message_id: optionalString,
  reply_version_artifact_id: optionalString,
  reply_error: optionalString,
  anchor_state: z.enum(['current', 'moved', 'outdated']).default('current'),
  current_artifact_id: optionalString,
  current_anchor: documentAnchorSchema.nullish().transform((value) => value ?? undefined),
  updated_at: optionalString,
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
/** Immutable document review, rendition, and working-copy workflows. */
export class DocumentRepository extends PluginRepository {
  public documentManifest(artifactId: string, signal?: AbortSignal): Promise<DocumentManifest> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/artifacts/${encodeURIComponent(artifactId)}/document`,
      decode: (value) => documentManifestSchema.parse(value),
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
          .parse(value),
      signal,
      timeoutMs: DOCUMENT_RENDITION_TIMEOUT_MS,
    });
  }

  public createDocumentWorkingCopy(
    artifactId: string,
    input: {
      session_id: string;
      writable?: boolean;
      auto_checkpoint?: boolean;
    },
    signal?: AbortSignal,
  ): Promise<DocumentWorkingCopy> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/artifacts/${encodeURIComponent(artifactId)}/working-copies`,
      body: input,
      decode: (value) => workingCopySchema.parse(value),
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
      decode: (value) => workingCopySchema.parse(value),
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
      decode: (value) => workingCopySchema.parse(value),
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
      decode: (value) => workingCopySchema.parse(value),
      signal,
    });
  }
}
