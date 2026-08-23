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

export interface ArtifactVersion {
  artifact_id: string;
  version: number;
  sha256?: string;
  path?: string;
  created_at?: string;
}

export interface ArtifactRecord {
  workspace_id: string;
  name: string;
  kind: string;
  latest_version: number;
  head_artifact_id: string;
  versions: ArtifactVersion[];
}

export interface ArtifactList {
  artifacts: ArtifactRecord[];
  count: number;
  next_cursor?: string | null;
}

export interface DocumentAnchor {
  profile:
    | 'text-quote'
    | 'pdf-quad'
    | 'dom'
    | 'sheet-range'
    | 'slide-shape'
    | 'native-comment'
    | 'source-map';
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
  anchors: DocumentAnchor['profile'][];
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
  conflict_head_artifact_id?: string;
  error?: string;
}

export interface DocumentEditorSession {
  id: string;
  working_copy_id: string;
  provider: 'onlyoffice' | 'collabora';
  status: 'ready' | 'unavailable' | 'closed';
  editor_url?: string;
  token?: string;
  expires_at?: string;
  config?: Record<string, unknown>;
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
