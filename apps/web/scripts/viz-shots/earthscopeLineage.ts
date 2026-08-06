/**
 * The REAL EarthScope lineage, captured read-only from the live backend on
 * 2026-08-06 — the exact graph behind the owner's annotated screenshot.
 *
 *   backend  127.0.0.1:17900
 *   session  sess_5c6ac7c103ac  ("Cross Session Artifacts")
 *   workspace ws_7983338db6b1
 *   GET /v1/artifacts/artifact_049e…/lineage?depth=8   → nodes/edges below
 *   GET /v1/sessions/sess_5c6ac7c103ac/artifacts?include_children=true
 *                                                      → tree + version facts
 *   GET /v1/sessions/sess_5c6ac7c103ac/agent-tasks     → run labels
 *   GET /v1/sessions/{id}                              → session titles
 *
 * Nothing here is invented or simplified: it is the wire payload verbatim, so
 * the bench renders the same route the app renders. The interesting shape is
 * SEVEN `pandas_filter_data` activities in seven different sessions that all
 * consumed the same input artifact and all produced the same output artifact
 * (same sha) — the re-derivation pile the regrammar collapses.
 */
import type { LineageGraph } from '../../src/detail/mintRecord';
import { routeFromLineage } from '../../src/detail/mintRecord';
import type { RouteStep } from '../../src/detail/types';
import type { SessionArtifactVersion } from '@clio/core';

export const PNG_ID = 'artifact_049e19a82ece49f1b12bfec93c182eee';
export const CLEAN_CSV_ID = 'artifact_ae0e2a6f71bc475c94bed03e0bd7daef';
export const CONVERTED_CSV_ID = 'artifact_0cddeffaf63749ec897f7916d9cf936f';

export const VIEWER_SESSION_ID = 'sess_5c6ac7c103ac';

const activity = (
  callId: string,
  tool: string,
  sessionId: string,
  turnId: string,
  status = 'success',
) => ({
  id: `activity:${callId}`,
  type: 'activity' as const,
  call_id: callId,
  tool,
  status,
  kind: 'contended',
  replay: 'reproducible',
  environment_tier: 'lockfile-hash',
  session_id: sessionId,
  turn_id: turnId,
});

export const EARTHSCOPE_LINEAGE: LineageGraph = {
  root: PNG_ID,
  nodes: [
    {
      id: PNG_ID,
      type: 'artifact',
      workspace_id: 'ws_7983338db6b1',
      name: 'earthscope_station_distribution.png',
      version: 1,
      kind: 'image',
      sha256: '636b40ac793dfa343b600fb644b76859dcef5f7ccf1cd4be961672ac57b1f0db',
      mechanism: 'tool-schema',
      producer_call_id: 'call_8a5a1dd83799',
    },
    activity('call_e0870b1821d1', 'create_artifact', 'sess_6d904ef19328', 'msg_user_e04863d63720'),
    {
      id: CLEAN_CSV_ID,
      type: 'artifact',
      workspace_id: 'ws_7983338db6b1',
      name: 'earthscope_stations_clean.csv',
      version: 1,
      kind: 'dataset',
      sha256: 'cd1b990223b8b4bd068f99aaab9549895839c70a79551ff1f444759e40470701',
      mechanism: 'tool-schema',
      producer_call_id: 'call_0aed8367ecfa',
    },
    activity('call_025278050bcf', 'pandas_filter_data', 'sess_cd8714c3baac', 'msg_user_3a3e72b1b0ef'),
    {
      id: CONVERTED_CSV_ID,
      type: 'artifact',
      workspace_id: 'ws_7983338db6b1',
      name: 'earthscope_converted_data.csv',
      version: 1,
      kind: 'dataset',
      sha256: '200bbe9115b30af6715831bb219102f698d9315d41141d6e2c5313b95ee6a983',
      mechanism: 'tool-schema',
      producer_call_id: 'call_dd9564016e76',
    },
    activity('call_8bc59eee6224', 'pandas_profile_csv', 'sess_6d904ef19328', 'msg_user_e04863d63720'),
    activity('call_ed36393d9738', 'plot_plot_timeseries', 'sess_6d904ef19328', 'msg_user_e04863d63720', 'failed'),
    activity('call_8a5a1dd83799', 'plot_plot_timeseries', 'sess_6d904ef19328', 'msg_user_e04863d63720'),
    activity('call_83cf6b5610c8', 'ndp_stage_resource', 'sess_cd8714c3baac', 'msg_user_3a3e72b1b0ef'),
    activity('call_7a490d3c5433', 'pandas_filter_data', 'sess_16c728d2a823', 'msg_user_48111b5e91e0'),
    activity('call_ed8aa9376a01', 'pandas_filter_data', 'sess_63cffcbec44f', 'msg_user_4b892d0e0ad0'),
    activity('call_11c43585d1a8', 'pandas_filter_data', 'sess_86f67e9a9306', 'msg_user_3d6b9377d358'),
    activity('call_66030a92c6a6', 'pandas_filter_data', 'sess_9423af7bdec9', 'msg_user_173a60648fcf'),
    activity('call_f6ae3c8e0e45', 'pandas_filter_data', 'sess_be8f51194c72', 'msg_user_d35b85975d09'),
    activity('call_0aed8367ecfa', 'pandas_filter_data', 'sess_cc806f98b07c', 'msg_user_87a54579b81a'),
  ],
  edges: [
    { from: 'activity:call_e0870b1821d1', to: PNG_ID, type: 'generated', evidence: 'hash-pair' },
    { from: PNG_ID, to: 'activity:call_e0870b1821d1', type: 'used', evidence: 'hash-pair' },
    { from: CLEAN_CSV_ID, to: 'activity:call_e0870b1821d1', type: 'used', evidence: 'hash-pair' },
    { from: 'activity:call_025278050bcf', to: CLEAN_CSV_ID, type: 'generated', evidence: 'hash-pair' },
    { from: CONVERTED_CSV_ID, to: 'activity:call_025278050bcf', type: 'used', evidence: 'hash-pair' },
    { from: CLEAN_CSV_ID, to: 'activity:call_8bc59eee6224', type: 'used', evidence: 'hash-pair' },
    { from: CLEAN_CSV_ID, to: 'activity:call_ed36393d9738', type: 'used', evidence: 'hash-pair' },
    { from: CLEAN_CSV_ID, to: 'activity:call_8a5a1dd83799', type: 'used', evidence: 'hash-pair' },
    { from: 'activity:call_8a5a1dd83799', to: PNG_ID, type: 'generated', evidence: 'hash-pair' },
    { from: 'activity:call_83cf6b5610c8', to: CONVERTED_CSV_ID, type: 'generated', evidence: 'hash-pair' },
    { from: CONVERTED_CSV_ID, to: 'activity:call_7a490d3c5433', type: 'used', evidence: 'hash-pair' },
    { from: 'activity:call_7a490d3c5433', to: CLEAN_CSV_ID, type: 'generated', evidence: 'hash-pair' },
    { from: CONVERTED_CSV_ID, to: 'activity:call_ed8aa9376a01', type: 'used', evidence: 'hash-pair' },
    { from: 'activity:call_ed8aa9376a01', to: CLEAN_CSV_ID, type: 'generated', evidence: 'hash-pair' },
    { from: CONVERTED_CSV_ID, to: 'activity:call_11c43585d1a8', type: 'used', evidence: 'hash-pair' },
    { from: 'activity:call_11c43585d1a8', to: CLEAN_CSV_ID, type: 'generated', evidence: 'hash-pair' },
    { from: CONVERTED_CSV_ID, to: 'activity:call_66030a92c6a6', type: 'used', evidence: 'hash-pair' },
    { from: 'activity:call_66030a92c6a6', to: CLEAN_CSV_ID, type: 'generated', evidence: 'hash-pair' },
    { from: CONVERTED_CSV_ID, to: 'activity:call_f6ae3c8e0e45', type: 'used', evidence: 'hash-pair' },
    { from: 'activity:call_f6ae3c8e0e45', to: CLEAN_CSV_ID, type: 'generated', evidence: 'hash-pair' },
    { from: CONVERTED_CSV_ID, to: 'activity:call_0aed8367ecfa', type: 'used', evidence: 'hash-pair' },
    { from: 'activity:call_0aed8367ecfa', to: CLEAN_CSV_ID, type: 'generated', evidence: 'hash-pair' },
  ],
};

/** The three versions the session-artifacts wire carries (size + mint time). */
const version = (
  artifactId: string,
  sizeBytes: number,
  createdAt: string,
  producer: { call_id: string; tool: string; session_id: string; turn_id: string },
): SessionArtifactVersion =>
  ({
    artifact_id: artifactId,
    workspace_id: 'ws_7983338db6b1',
    version: 1,
    size_bytes: sizeBytes,
    created_at: createdAt,
    producer: { ...producer, designation: 'tool-arg' },
  }) as unknown as SessionArtifactVersion;

export const EARTHSCOPE_VERSIONS = new Map<string, SessionArtifactVersion>([
  [
    PNG_ID,
    version(PNG_ID, 900221, '2026-08-06T11:23:00.750508+00:00', {
      call_id: 'call_8a5a1dd83799',
      tool: 'plot_plot_timeseries',
      session_id: 'sess_6d904ef19328',
      turn_id: 'msg_user_e04863d63720',
    }),
  ],
  [
    CLEAN_CSV_ID,
    version(CLEAN_CSV_ID, 162790, '2026-08-06T05:57:57.981798+00:00', {
      call_id: 'call_0aed8367ecfa',
      tool: 'pandas_filter_data',
      session_id: 'sess_cc806f98b07c',
      turn_id: 'msg_user_87a54579b81a',
    }),
  ],
  [
    CONVERTED_CSV_ID,
    version(CONVERTED_CSV_ID, 153082, '2026-08-06T05:57:28.857591+00:00', {
      call_id: 'call_dd9564016e76',
      tool: 'ndp_stage_resource',
      session_id: 'sess_cc806f98b07c',
      turn_id: 'msg_user_87a54579b81a',
    }),
  ],
]);

/** The viewing session's TREE and its agent-task run labels (live values). */
export const EARTHSCOPE_TREE = new Set([
  VIEWER_SESSION_ID,
  'sess_6d904ef19328',
  'sess_86f67e9a9306',
]);

export const EARTHSCOPE_RUN_LABELS = new Map([
  ['sess_6d904ef19328', 'visualization #1'],
  ['sess_86f67e9a9306', 'ndp #1'],
]);

/** Every session title the live backend returns for this story. */
export const EARTHSCOPE_SESSION_TITLES: Record<string, string> = {
  sess_5c6ac7c103ac: 'Cross Session Artifacts',
  sess_6d904ef19328: 'visualization task',
  sess_86f67e9a9306: 'ndp task',
  sess_cd8714c3baac: 'ndp task',
  sess_16c728d2a823: 'ndp task',
  sess_63cffcbec44f: 'ndp task',
  sess_9423af7bdec9: 'ndp task',
  sess_be8f51194c72: 'ndp task',
  sess_cc806f98b07c: 'ndp task',
};

/** The route the app itself mints for this artifact — same call, same context. */
export function earthscopeRoute(): RouteStep[] {
  return routeFromLineage(EARTHSCOPE_LINEAGE, {
    viewerSessionId: VIEWER_SESSION_ID,
    versionsById: EARTHSCOPE_VERSIONS,
    treeSessionIds: EARTHSCOPE_TREE,
    treeRunLabels: EARTHSCOPE_RUN_LABELS,
  });
}
