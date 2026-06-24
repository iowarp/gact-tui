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

/**
 * One attributed segment inside the per-scope context working set (the rows
 * the segment store tracks). The backend keeps this open-ended; the fields
 * below are the ones the UIs surface.
 */
export interface ContextSegment {
  id?: string;
  kind?: string;
  tokens?: number;
  label?: string;
  [k: string]: unknown;
}

/**
 * Per-expert context-usage snapshot (SPEC §6.9 vendor route
 * `x_clio_context_state`): GET /v1/sessions/{id}/context/state?scope=<expert>.
 *
 * Two distinct token measures coexist:
 *  - `live_tokens` is the segment-store attribution sum (always present).
 *  - `used_tokens` is the REAL prompt-token count from the last LM call —
 *    model-grounded but `null` between turns.
 *
 * Fullness should prefer `used_pct` (model-grounded) and fall back to
 * `pct_used` (live/window). Draw the auto-compaction trigger line at
 * `autocompact_pct` (a fraction in (0, 1], default 0.85).
 *
 * `categories` are the /context-style buckets keyed by group
 * (system|messages|tools|reasoning|tool_calls|observations|summary|io|other)
 * plus a synthetic `framing` key (= used_tokens − live_tokens) that is only
 * present when `used_tokens > 0` and framing > 0; zero buckets are dropped.
 */
export interface ContextState {
  session_id: string;
  scope: string;
  /** Epoch millis of the snapshot, or null if never observed. */
  as_of: number | null;
  /** Model context window in tokens; 0 = unknown. */
  window_tokens: number;
  /** Segment-store attribution sum. */
  live_tokens: number;
  /** live_tokens / window_tokens, or null when the window is unknown. */
  pct_used: number | null;
  /** Last LM call's REAL prompt tokens; null between turns. */
  used_tokens: number | null;
  /** used_tokens / window_tokens; null when unavailable. */
  used_pct: number | null;
  /** Auto-compaction trigger fraction in (0, 1] (default 0.85); null if off. */
  autocompact_pct: number | null;
  live_block_count: number;
  /** Per-SegmentKind token totals. */
  tokens_by_kind: Record<string, number>;
  /** /context-style buckets including the synthetic `framing` key. */
  categories: Record<string, number>;
  segments: ContextSegment[];
  render_text: string;
  render_keys: Record<string, unknown>;
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
