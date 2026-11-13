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
  | 'image'
  | 'binary';

export type DocumentAnchorProfile =
  | 'text-quote'
  | 'pdf-quad'
  | 'dom'
  | 'sheet-range'
  | 'slide-shape'
  | 'native-comment'
  | 'source-map'
  | 'region';

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
  /** A region's normalized [x, y, width, height]; an element's box in CSS pixels. */
  rect?: number[];
  natural_width?: number;
  natural_height?: number;
  crop_asset?: string;
  tag?: string;
  text_excerpt?: string;
  html_excerpt?: string;
  /** A picked image's source (its `currentSrc`), beside its selector. */
  src?: string;
  viewport_width?: number;
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
  rendition_formats: string[];
  pdf_rendition_artifact_id?: string;
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
  status: 'draft' | 'queued' | 'dispatched' | 'human-note' | 'failed' | 'stale' | 'discarded';
  native: boolean;
  native_text_hash?: string;
  idempotency_key?: string;
  message_id?: string;
  created_at: string;
  error?: string;
  /** `S1`, `S2`, ...: the mark's label, the same in the viewer, the list and the agent's text. */
  label?: string;
  session_key?: string;
  send_to_agent?: boolean;
  reply_text?: string;
  reply_message_id?: string;
  reply_version_artifact_id?: string;
  reply_error?: string;
  anchor_state?: 'current' | 'moved' | 'outdated';
  /** Why the thread's own version could not be read when it was re-anchored (it is then outdated). */
  anchor_error?: string;
  current_artifact_id?: string;
  current_anchor?: DocumentAnchor;
  updated_at?: string;
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

export interface DocumentRendition {
  source_artifact_id: string;
  converter: string;
  artifact: DocumentManifest;
}
