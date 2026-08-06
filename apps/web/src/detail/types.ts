/**
 * Artifact record shape, as the prototype renders it.
 *
 * The four axes and the route DAG are the S5 provenance taxonomy that
 * clio-agent#966 already ships — this is a rename of the prototype's terse
 * field names (mech/desig/ev) into their full spelling, not a new model.
 */

export type RouteEdgeKind = 'used' | 'generated' | 'revised' | 'derived';

/**
 * One lineage line (provenance rework, docs/design/provenance-graph-2026-08.md):
 * a node is ONE line — glyph + name + inline muted sub-info — never a bordered
 * box. The typed facts below are threaded from the two real wires (the lineage
 * route's nodes and the session-artifacts route's versions); absent facts stay
 * absent rather than fabricated.
 */
export interface RouteNode {
  kind: 'node';
  nodeType: 'artifact' | 'activity' | 'gap';
  label: string;
  /** Free-form extra sub-info (e.g. "external source"), rendered after the
   *  typed parts. */
  sub?: string;
  /** Marks the record this route belongs to. */
  self?: boolean;

  /** Artifact node: the version's real artifact_id — the open-in-panel target
   *  for a non-self node click (push onto the detail stack). */
  artifactId?: string;
  /** Artifact node: version label (`v1`). */
  version?: string;
  /** Artifact node: human size (`50.4 MB`), threaded from the session
   *  artifacts wire's `size_bytes` (the lineage wire carries none). */
  size?: string;
  /** Artifact node: version mint time (ISO), threaded from the artifacts
   *  wire's `created_at` — backs the foreign cluster header's timestamp. */
  createdAt?: string;

  /** Activity node: the transform's tool. */
  tool?: string;
  /** Activity node: human duration (`7.9s`) when the wire carries timing. */
  duration?: string;
  /** Activity node: the status pill when not plain-ok — `reproducible` /
   *  `gap` / `failed`. The wire's `re-runnable` replay default is the
   *  plain-ok baseline and renders no pill (Mockups 1/2). */
  status?: string;

  /** The producing session — an activity's own `session_id`; an artifact's
   *  producer activity's session. Backs cluster grouping + navigation. */
  sessionId?: string;
  /** The producing turn (activity nodes), for transcript navigation. */
  turnId?: string;
  /** Set when the producing session differs from the viewing session — the
   *  node groups under a foreign cluster header (spec rule 3). */
  foreignSession?: boolean;

  /** Gap node: why the chain is broken here. */
  gapReason?: string;
}

export interface RouteEdge {
  kind: 'edge';
  edge: RouteEdgeKind;
  /** How the edge is justified — the evidence stance for this hop. */
  stance?: string;
  /** A used edge joining INTO a consumer that is not the next line — drawn
   *  with a join elbow (`╮`) toward the consumer (spec rule 2/4). */
  join?: boolean;
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
  /** The replay-contract label, shown as a pill on the Recreate tab (the
   *  TRANSFORM RECORD fold is deleted — provenance rework 2026-08). Only the
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
