/**
 * Type declarations for verdict.mjs's pure API (moduleResolution: "Bundler"
 * resolves a `.mjs` import against a sibling `.d.mts`). Kept in sync by
 * hand — the reducer itself stays plain JS + JSDoc per the rest of
 * `apps/web/scripts/`; this file exists only so the typed test suite
 * importing it gets real types instead of `any`.
 */

export declare const VERDICT_CLASSES: readonly [
  'server-late',
  'transport-lost',
  'render-late',
  'not-reproduced',
];

export type VerdictClass = (typeof VERDICT_CLASSES)[number];

export interface VerdictThresholds {
  minVisibleGapMs: number;
  minServerWindowMs: number;
}

export declare const DEFAULT_THRESHOLDS: VerdictThresholds;

export interface ToolCallTimes {
  t_published?: number | null | undefined;
  t_received?: number | null | undefined;
  t_dom?: number | null | undefined;
  t_result?: number | null | undefined;
}

export declare function classifyToolCall(
  times: ToolCallTimes,
  thresholds?: VerdictThresholds,
): VerdictClass;

export declare function dedupeServerFrames(
  rows: Array<Record<string, unknown>>,
): Array<Record<string, unknown>>;

export interface DomToolRow {
  t: number;
  textHead?: string;
  [key: string]: unknown;
}

export interface CallActivityRef {
  part_id: string;
  tool_name?: string;
}

export declare function matchDomRowsToCalls(
  callActivitiesChronological: CallActivityRef[],
  domToolRowsChronological: DomToolRow[],
): Map<string, DomToolRow | undefined>;

export interface VerdictCall {
  part_id: string;
  tool_name?: string;
  call_id?: string;
  attempts: number;
  t_published?: number;
  t_received?: number;
  t_dom?: number;
  t_result?: number;
  verdict: VerdictClass;
  server_event_ids: string[];
}

export interface VerdictStreams {
  serverRows: Array<Record<string, unknown>>;
  clientRows: Array<Record<string, unknown>>;
  domRows: Array<Record<string, unknown>>;
  auditRows?: Array<Record<string, unknown>>;
}

export interface VerdictOptions {
  thresholds?: VerdictThresholds;
  now?: () => string;
}

export interface VerdictDocument {
  generated_at: string;
  thresholds: VerdictThresholds;
  calls: VerdictCall[];
  server_ids_absent_client_side: string[];
  unexplained_client_events: Array<Record<string, unknown>>;
  counts: {
    server_frames_raw: number;
    server_frames_deduped: number;
    client_frames: number;
    dom_tool_rows: number;
    audit_rows: number;
    calls: number;
  };
}

export declare function computeVerdict(
  streams: VerdictStreams,
  options?: VerdictOptions,
): VerdictDocument;
