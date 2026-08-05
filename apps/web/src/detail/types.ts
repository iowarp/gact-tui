/**
 * Artifact record shape, as the prototype renders it.
 *
 * The four axes and the route DAG are the S5 provenance taxonomy that
 * clio-agent#966 already ships — this is a rename of the prototype's terse
 * field names (mech/desig/ev) into their full spelling, not a new model.
 */

export type RouteEdgeKind = 'used' | 'generated' | 'revised' | 'derived';

export interface RouteNode {
  kind: 'node';
  nodeType: 'artifact' | 'activity' | 'agent';
  label: string;
  sub?: string;
  /** Marks the record this route belongs to. */
  self?: boolean;
}

export interface RouteEdge {
  kind: 'edge';
  edge: RouteEdgeKind;
  /** How the edge is justified — the evidence stance for this hop. */
  stance?: string;
}

export type RouteStep = RouteNode | RouteEdge;

export interface ArtifactRecord {
  id: string;
  sha?: string;
  size?: string;
  kind?: string;
  /** The coarse detail-slot kind (the prototype's badge: ARTIFACT / ANSWER /
   *  AGENT). Only 'artifact' records are minted today — answer/agent are not
   *  yet a real record shape anywhere in the app (E7 backlog). */
  recordKind?: 'artifact' | 'answer' | 'agent';
  /** Clickable trail shown under the header, e.g. ['session', 'earthscope_stations_…']. */
  breadcrumb?: string[];

  /** How the artifact came to exist (harness, agent, user). */
  mechanism?: string;
  /** How it was named as an artifact (tool-declared, agent-designated). */
  designation?: string;
  /** What backs the identity claim (hashed-at-use, authority-asserted). */
  evidence?: string;
  /** Where the bytes live. */
  custody?: string;

  note?: string;
  /** The call that produced it — the recreate instrument. */
  instrument?: string;
  revision?: string;
  /** Where the version's bytes live — the version wire's `path`
   *  (routes/artifacts.py `_version_wire`). Backs the Overview storage row. */
  storagePath?: string;
  /** The workspace custodying those bytes (`workspace_id` on the version),
   *  so the storage row can open the right workspace's files layer. */
  workspaceId?: string;
  /** The replay-contract label on the TRANSFORM RECORD fold's pill. Only the
   *  wire's honest `custody_gap` → 'gap' marker is mintable from the
   *  session-artifacts route today; reproducible/re-runnable ride the
   *  transform payloads (#971) and stay absent rather than guessed. */
  transformStatus?: 'reproducible' | 're-runnable' | 'gap';

  route?: RouteStep[];

  /** Fetched content preview for the ARTIFACT tab (prototype: CSV table,
   *  inline PNG, rendered markdown). Absent while loading or unfetchable. */
  preview?: ArtifactPreview;
}

export type ArtifactPreview =
  | { kind: 'image'; url: string }
  | { kind: 'markdown'; text: string }
  | { kind: 'csv'; header: string[]; rows: string[][]; totalRows?: number }
  | { kind: 'text'; text: string };
