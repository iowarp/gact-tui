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

  route?: RouteStep[];
}
