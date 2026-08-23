export type DocumentProfile =
  | 'markdown'
  | 'pdf'
  | 'latex'
  | 'html-static'
  | 'ooxml-word'
  | 'ooxml-sheet'
  | 'ooxml-slides'
  | 'odf-text'
  | 'odf-sheet'
  | 'odf-slides'
  | 'binary';

export type DocumentAnchorProfile =
  | 'text-quote'
  | 'pdf-quad'
  | 'dom'
  | 'sheet-range'
  | 'slide-shape'
  | 'native-comment'
  | 'source-map';

export interface DocumentAnchor {
  profile: DocumentAnchorProfile;
  exact?: string;
  prefix?: string;
  suffix?: string;
  source_path?: string;
  start?: number;
  end?: number;
  page_index?: number;
  quads?: number[][];
  selector?: string;
  stable_id?: string;
  sheet?: string;
  cell_range?: string;
  slide_id?: string;
  shape_id?: string;
  native_comment_id?: string;
  source?: Record<string, unknown>;
}

export interface DocumentManifest {
  artifact_id: string;
  workspace_id: string;
  name: string;
  version: number;
  sha256: string;
  mime_type: string;
  profile: DocumentProfile;
  content_url: string;
  anchors: DocumentAnchorProfile[];
  native_open: boolean;
  embedded_editors: Array<'onlyoffice' | 'collabora'>;
  rendition_formats: string[];
  provenance: Record<string, unknown>;
}

export interface ArtifactReview {
  id: string;
  session_id: string;
  workspace_id: string;
  artifact_id: string;
  artifact_name: string;
  artifact_version: number;
  artifact_sha256: string;
  anchor: DocumentAnchor;
  text: string;
  status: 'queued' | 'dispatched' | 'human-note' | 'failed' | 'stale';
  native: boolean;
  native_text_hash?: string;
  idempotency_key?: string;
  message_id?: string;
  created_at: string;
  error?: string;
}

export interface DocumentWorkingCopy {
  id: string;
  session_id: string;
  workspace_id: string;
  artifact_name: string;
  base_artifact_id: string;
  head_artifact_id: string;
  base_version: number;
  head_version: number;
  base_sha256: string;
  last_sha256: string;
  path: string;
  provider: 'native' | 'onlyoffice' | 'collabora';
  writable: boolean;
  auto_checkpoint: boolean;
  status: 'active' | 'conflict' | 'closed' | 'missing' | 'error';
  created_at: string;
  updated_at: string;
  last_checkpoint_at?: string;
  conflict_head_artifact_id?: string;
  conflict_candidate_sha256?: string;
  error?: string;
  native_comment_fingerprints: string[];
}

export interface DocumentEditorSession {
  id: string;
  working_copy_id: string;
  provider: 'onlyoffice' | 'collabora';
  status: 'ready' | 'unavailable' | 'closed';
  editor_url?: string;
  token?: string;
  expires_at?: string;
  config: Record<string, unknown>;
  error?: string;
}

export interface DocumentEditorHealth {
  editors: Array<{
    provider: 'onlyoffice' | 'collabora';
    url: string;
    configured: boolean;
    healthy: boolean;
    error?: string;
  }>;
}

export interface DocumentRendition {
  source_artifact_id: string;
  converter: string;
  artifact: DocumentManifest;
}

export interface SubmitArtifactReviewInput {
  artifact_id: string;
  expected_version: number;
  expected_sha256: string;
  anchor: DocumentAnchor;
  text: string;
  idempotency_key: string;
  allow_historical?: boolean;
}
