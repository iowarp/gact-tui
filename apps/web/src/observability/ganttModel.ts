/**
 * The gantt's data → geometry model (viz rebuild, 2026-08).
 *
 * Pure functions only: no React, no DOM, no time source. Everything here is a
 * deterministic transform of the wire's own `ObsSpan` facts (real `startMs` /
 * `endMs` / `label` / `depth` / `state`) into lanes, colours and a visible time
 * window. Layout is the ONLY thing derived — no fact is invented.
 *
 * The two invariants this module exists to guarantee, both asserted directly in
 * `tests/unit/gantt-model.test.ts`:
 *
 * 1. **No two overlapping spans ever share a lane.** Concurrent fanout siblings
 *    are separate branches, so they are separate lanes by construction; a single
 *    branch whose own spans overlap (main's turn bar and the tool calls nested
 *    inside it) is split into as many sub-lanes as the overlap depth requires,
 *    by greedy interval partitioning.
 * 2. **A branch's colour is stable.** Same branch key ⇒ same palette entry,
 *    independent of arrival order, span count, or how many other branches exist.
 *    The log tree rail reads the same function, so an agent is one colour across
 *    the whole observability layer.
 */
import type { ObsNavigation, ObsSpan } from './types';

/**
 * A curated dark-theme branch palette. Index 0 is the app's own teal, reserved
 * for `main` so the primary agent never changes colour between sessions.
 *
 * The other six are held apart in hue AND lightness from each other, from main's
 * teal (a sky blue tested here first read as "another main"), and from the two
 * colours that carry STATE rather than identity — amber `#c4682a` (running) and
 * red `#f87171` (failed) — so a branch colour can never be misread as a status.
 * All six clear 4.5:1 against the `#16181d` card surface.
 *
 * Six, not more: past that the separations get too fine to read at a 3px swatch
 * and a 12px bar, and real fanouts run two to four children. Beyond six
 * concurrent branches {@link assignBranchColors} reuses entries evenly rather
 * than adding colours nobody can tell apart.
 */
export const BRANCH_PALETTE = [
  '#0aa6ad', // teal — main
  '#7aa2f7', // blue
  '#9d7cd8', // violet
  '#55b868', // green
  '#d18bb0', // rose
  '#b8bb26', // lime
  '#d99ae0', // light magenta
] as const;

/** The branch key every `main` span (its turns and its own tool calls) maps to. */
export const MAIN_BRANCH = 'main';

/** FNV-1a 32-bit — a small, well-defined, order-independent string hash. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * The stable colour for a branch, considered alone. `main` is pinned to the teal
 * at index 0; every other branch hashes over the remaining seven entries.
 *
 * Use {@link assignBranchColors} when the whole set of branches is known — a
 * bare hash over seven slots collides often enough to matter (`ndp #1` and
 * `geospatial #1` land on the same entry), and two concurrent agents drawn in
 * one colour is the exact failure this palette exists to prevent.
 */
export function branchColor(branch: string): string {
  if (branch === MAIN_BRANCH) return BRANCH_PALETTE[0];
  return BRANCH_PALETTE[1 + (fnv1a(branch) % (BRANCH_PALETTE.length - 1))]!;
}

/** Resolves a branch key to its colour — the shape both surfaces consume. */
export type BranchColorResolver = (branch: string) => string;

/**
 * The colour map for one session view: every branch gets its hashed preference
 * when that slot is free, and the next free slot otherwise, so **no two branches
 * in the same view share a colour** while there are slots left.
 *
 * Determinism: branches are resolved in sorted key order, never arrival order,
 * so the same set of agents always produces the same map however the events
 * happened to interleave. Both the gantt and the log rail are handed the SAME
 * map (composed once in `Observability`), so an agent is one colour across the
 * layer — computing it per surface would let the two disagree whenever their
 * branch sets differed.
 *
 * Past seven non-main branches the palette is exhausted and colours necessarily
 * repeat; assignment keeps cycling so reuse is spread evenly rather than piling
 * onto one entry.
 */
export function assignBranchColors(branches: Iterable<string>): Map<string, string> {
  const slots = BRANCH_PALETTE.length - 1;
  const keys = [...new Set(branches)].filter((key) => key !== MAIN_BRANCH).sort();
  const taken = new Set<number>();
  const colors = new Map<string, string>([[MAIN_BRANCH, BRANCH_PALETTE[0]]]);
  for (const key of keys) {
    const preferred = fnv1a(key) % slots;
    let slot = preferred;
    for (let probe = 0; probe < slots; probe += 1) {
      const candidate = (preferred + probe) % slots;
      if (!taken.has(candidate)) {
        slot = candidate;
        break;
      }
    }
    if (taken.size >= slots) taken.clear();
    taken.add(slot);
    colors.set(key, BRANCH_PALETTE[1 + slot]!);
  }
  return colors;
}

/**
 * A span's branch — the AGENT identity it belongs to, read off facts the span
 * already carries:
 *
 * - `tool: true` marks the ROOT session's own tool calls (build.ts only ever
 *   mints tool spans from the root trace), so they ride main's branch — they
 *   are main's activity, nested inside main's turn.
 * - otherwise the label's own prefix before the ` · ` separator: `main · turn 1`
 *   and `main · turn 2` are the same agent's consecutive turns and belong on one
 *   lane; a child agent's label (`ndp #1`) has no separator and is its own key.
 */
export function branchKey(span: ObsSpan): string {
  if (span.tool) return MAIN_BRANCH;
  const label = span.label.trim();
  const separator = label.indexOf(' · ');
  const key = separator > 0 ? label.slice(0, separator).trim() : label;
  return key || span.id;
}

export interface GanttLane {
  /** Stable per-lane React key. */
  id: string;
  /** The agent identity this lane draws — shared by every lane of one branch. */
  branch: string;
  /** 0 for a branch's first lane; 1+ for the overflow lanes an overlap forced. */
  laneIndex: number;
  /** Row label: the lane's single span's own label when it holds exactly one
   *  (so a tool bar keeps its tool name), else the branch name. */
  label: string;
  /** Shallowest depth among this lane's spans — drives the label indent. */
  depth: number;
  color: string;
  spans: ObsSpan[];
  /** The lane's navigation target, taken from its first span that has one. */
  nav?: ObsNavigation;
}

/** A span's effective end for overlap purposes: a running span (endMs null) has
 *  not finished, so it occupies its lane from its start onward. */
function spanEnd(span: ObsSpan): number {
  return span.endMs === null ? Number.POSITIVE_INFINITY : Math.max(span.endMs, span.startMs);
}

/**
 * Partition spans into lanes: one branch per agent, and within a branch as many
 * lanes as its own concurrency demands (greedy interval partitioning — a span
 * joins the first lane of its branch whose last span already ended, else opens a
 * new one). Branch order follows each branch's earliest start, so the reading
 * order stays chronological; within a branch, lane 0 first.
 */
export function assignLanes(spans: ObsSpan[], colorOf: BranchColorResolver = branchColor): GanttLane[] {
  const byBranch = new Map<string, ObsSpan[]>();
  for (const span of spans) {
    const key = branchKey(span);
    const bucket = byBranch.get(key);
    if (bucket) bucket.push(span);
    else byBranch.set(key, [span]);
  }

  const branches = [...byBranch.entries()].sort((left, right) => {
    const leftStart = Math.min(...left[1].map((span) => span.startMs));
    const rightStart = Math.min(...right[1].map((span) => span.startMs));
    if (leftStart !== rightStart) return leftStart - rightStart;
    return left[0].localeCompare(right[0]);
  });

  const lanes: GanttLane[] = [];
  for (const [branch, branchSpans] of branches) {
    const ordered = [...branchSpans].sort((left, right) =>
      left.startMs === right.startMs ? spanEnd(left) - spanEnd(right) : left.startMs - right.startMs,
    );
    // packed[i] = the end time of lane i's last span.
    const packed: number[] = [];
    const buckets: ObsSpan[][] = [];
    for (const span of ordered) {
      let lane = packed.findIndex((end) => end <= span.startMs);
      if (lane === -1) {
        lane = packed.length;
        packed.push(Number.NEGATIVE_INFINITY);
        buckets.push([]);
      }
      packed[lane] = spanEnd(span);
      buckets[lane]!.push(span);
    }
    buckets.forEach((bucket, laneIndex) => {
      const nav = bucket.find((span) => span.nav)?.nav;
      lanes.push({
        id: `${branch}#${laneIndex}`,
        branch,
        laneIndex,
        label: bucket.length === 1 ? bucket[0]!.label : branch,
        depth: Math.min(...bucket.map((span) => span.depth)),
        color: colorOf(branch),
        spans: bucket,
        ...(nav ? { nav } : {}),
      });
    });
  }
  return lanes;
}

export interface TimeWindow {
  min: number;
  max: number;
}

/**
 * The full data extent every zoom level is a sub-window of. A running span has
 * no end, so `now` (passed in — this module never reads the clock) extends the
 * window so a live bar keeps growing. A degenerate extent is widened to one
 * second so the scale never divides by zero.
 */
export function fullExtent(spans: ObsSpan[], now: number): TimeWindow {
  if (spans.length === 0) return { min: now - 1_000, max: now };
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let running = false;
  for (const span of spans) {
    if (span.startMs < min) min = span.startMs;
    if (span.endMs === null) running = true;
    else if (span.endMs > max) max = span.endMs;
    for (const at of span.artifactAtMs ?? []) {
      if (at < min) min = at;
      if (at > max) max = at;
    }
    for (const mark of span.toolMarks ?? []) {
      if (mark.atMs < min) min = mark.atMs;
      if (mark.atMs > max) max = mark.atMs;
    }
  }
  if (running && now > max) max = now;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: now - 1_000, max: now };
  return max > min ? { min, max } : { min, max: min + 1_000 };
}

/** A timestamp's position in the visible window, as a percentage. Values outside
 *  the window come back outside 0..100 so callers can decide to clip or clamp. */
export function percentIn(at: number, window: TimeWindow): number {
  const span = window.max - window.min;
  if (span <= 0) return 0;
  return ((at - window.min) / span) * 100;
}

export interface BarGeometry {
  /** Left edge as a percentage of the lane, clamped into view. */
  left: number;
  /** Width as a percentage of the lane, clamped into view. */
  width: number;
  /** True when the bar's real start is left of the visible window. */
  clippedStart: boolean;
  /** True when the bar's real end is right of the visible window. */
  clippedEnd: boolean;
}

/**
 * A span's bar inside the visible window, clipped to it. Returns null when the
 * span lies entirely outside — the caller renders nothing rather than a bar
 * pinned to an edge it does not actually touch.
 *
 * `now` closes a running span's right edge; the bar is never widened past the
 * real data and never given an artificial minimum here (CSS `min-width` keeps a
 * sub-pixel call visible without lying about its extent).
 */
export function barGeometry(span: ObsSpan, window: TimeWindow, now: number): BarGeometry | null {
  const start = span.startMs;
  const end = span.endMs === null ? Math.max(now, span.startMs) : Math.max(span.endMs, start);
  if (end < window.min || start > window.max) return null;
  const rawLeft = percentIn(start, window);
  const rawRight = percentIn(end, window);
  const left = Math.max(0, Math.min(100, rawLeft));
  const right = Math.max(0, Math.min(100, rawRight));
  return {
    left,
    width: Math.max(0, right - left),
    clippedStart: rawLeft < 0,
    clippedEnd: rawRight > 100,
  };
}
