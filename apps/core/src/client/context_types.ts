import type {
  ContextFile,
  ContextFileContent,
  WorkspaceFileEntry,
} from '../wire/types.js';

/**
 * One assembled-context line item inside a frame (SPEC §6.9 vendor
 * x_clio_context_frames): what the backend actually fed to the model, with the
 * inclusion decision (`included`), the human-readable `reason`, and the
 * per-item token estimate. The TUI surfaces all three; the web previously only
 * showed the frame-level `token_count`.
 */
export interface ContextFrameItem {
  kind?: string;
  included?: boolean;
  reason?: string;
  tokens_estimated?: number;
  role?: string;
  path?: string;
  display_path?: string;
  source_id?: string;
  [k: string]: unknown;
}

export interface ContextFrame {
  id: string;
  created_at?: string;
  status?: string;
  summary?: string;
  token_count?: number;
  tokens_estimated?: number;
  items?: ContextFrameItem[];
  [k: string]: unknown;
}

export type ContextFrameDetail = Record<string, unknown>;

export interface ContextFramesResult {
  frames: ContextFrame[];
}

export interface ContextFileListResult {
  files: ContextFile[];
}

export type ContextFileMode = 'read' | 'edit' | 'pin';

export interface AddContextFileInput {
  path: string;
  mode?: string;
  language?: string;
}

export type AddContextFileResult = ContextFile;

export interface AttachmentFileInput {
  name: string;
  type?: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type UploadAttachmentResult = ContextFile;

export interface PatchContextFileInput {
  path: string;
  mode: ContextFileMode;
}

export interface WorkspaceFileListResult {
  entries: WorkspaceFileEntry[];
}

export type ReadWorkspaceFileResult = ContextFileContent;
