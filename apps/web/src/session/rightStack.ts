/**
 * The right panel's stack model (the prototype's `stack[]`/`setStack`).
 *
 * Two entry kinds share the one 480px slot: artifact detail records
 * (chips/obs → DetailSlot) and the shift-click AGENT PEEK (the prototype's
 * `goPkrd: (e) => { if (e.shiftKey) this.setStack(['pkrd']); else
 * this.setFocus(['pkrd']); }` — shift-click keeps the main transcript and
 * opens the child read-only on the right, plain click drills into the
 * center). Extracted from SessionView so the routing decision is a pure,
 * testable reducer rather than an inline closure.
 */
import type { ArtifactRecord } from '../detail/types';

/** An artifact detail record mounted in the right slot via DetailSlot. */
export interface ArtifactStackEntry {
  kind: 'artifact';
  record: ArtifactRecord;
}

/** A shift-click agent peek: a READ-ONLY view of the child session in the
 *  right slot — the main transcript stays put, the composer keeps talking to
 *  whatever it talked to before. */
export interface AgentPeekStackEntry {
  kind: 'agent-peek';
  sessionId: string;
  agent: string;
  /** Names the delegating parent in the peek's own "prompt from …" fold. */
  parentLabel: string;
}

export type RightStackEntry = ArtifactStackEntry | AgentPeekStackEntry;

/**
 * Opening from a chip/Call box REPLACES the stack (prototype artGo/setStack);
 * provenance navigation PUSHES (`push: true`) so the breadcrumb can walk back
 * out of the drill-down.
 */
export function openRightEntry(
  stack: RightStackEntry[],
  entry: RightStackEntry,
  opts?: { push?: boolean },
): RightStackEntry[] {
  return opts?.push ? [...stack, entry] : [entry];
}

/**
 * Patch the TOP entry iff it is still the artifact the patch was fetched for.
 * A stack that moved on — a different artifact on top, an agent peek, or
 * closed entirely — is returned untouched (same reference), so a late
 * lineage/preview arrival never lands on the wrong record.
 */
export function patchTopArtifact(
  stack: RightStackEntry[],
  artifactId: string,
  patch: Partial<ArtifactRecord>,
): RightStackEntry[] {
  const top = stack[stack.length - 1];
  if (!top || top.kind !== 'artifact' || top.record.id !== artifactId) return stack;
  return [...stack.slice(0, -1), { ...top, record: { ...top.record, ...patch } }];
}

/** The breadcrumb label an entry contributes to the detail trail. */
export function rightEntryLabel(entry: RightStackEntry): string {
  if (entry.kind === 'agent-peek') return entry.agent;
  return entry.record.breadcrumb?.[entry.record.breadcrumb.length - 1] ?? entry.record.id;
}
