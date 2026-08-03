/**
 * Command-palette frecency (W3 Tier-2).
 *
 * Tracks how often and how recently each palette command is used so the
 * empty-query palette surfaces what the user actually reaches for, the way
 * editor command palettes (VS Code, Sublime) do.
 *
 * Score = use-count weighted by recency bucket (today ×4, this week ×2,
 * older ×1) — the classic Firefox "frecency" shape, simplified.
 */
import { createSignal } from 'solid-js';

const KEY = 'clio.palette-frecency.v1';
const MAX_ENTRIES = 100;

interface FrecencyEntry {
  count: number;
  lastUsed: number; // epoch ms
}

type FrecencyMap = Record<string, FrecencyEntry>;

function load(): FrecencyMap {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function save(map: FrecencyMap) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* quota — ignore */
  }
}

// Bumped on every recordUse so memos depending on frecency re-rank.
const [version, setVersion] = createSignal(0);

/** Reactive dependency hook — read this in memos that rank by frecency. */
export const frecencyVersion = version;

/** Record one use of a palette command. */
export function recordCommandUse(id: string): void {
  const map = load();
  const prev = map[id];
  map[id] = { count: (prev?.count ?? 0) + 1, lastUsed: Date.now() };
  // Cap the map so it can't grow unbounded over months of use — drop the
  // lowest-scoring entries.
  const ids = Object.keys(map);
  if (ids.length > MAX_ENTRIES) {
    ids
      .sort((a, b) => score(map[b]!) - score(map[a]!))
      .slice(MAX_ENTRIES)
      .forEach((drop) => delete map[drop]);
  }
  save(map);
  setVersion((v) => v + 1);
}

function score(e: FrecencyEntry): number {
  const age = Date.now() - e.lastUsed;
  const day = 24 * 60 * 60 * 1000;
  const weight = age < day ? 4 : age < 7 * day ? 2 : 1;
  return e.count * weight;
}

/** Frecency score for a command id (0 = never used). */
export function commandScore(id: string): number {
  const e = load()[id];
  return e ? score(e) : 0;
}

/**
 * Stable-sort `items`: previously-used commands first (by descending
 * frecency), never-used commands keep their original order after them.
 * Returns the ids of the top `markTop` used items so the caller can badge
 * them as "recent".
 */
export function rankByFrecency<T>(
  items: readonly T[],
  getId: (item: T) => string,
  markTop = 3,
): { ranked: T[]; recentIds: Set<string> } {
  const map = load();
  const used: { item: T; s: number }[] = [];
  const fresh: T[] = [];
  for (const item of items) {
    const e = map[getId(item)];
    if (e) used.push({ item, s: score(e) });
    else fresh.push(item);
  }
  used.sort((a, b) => b.s - a.s);
  return {
    ranked: [...used.map((u) => u.item), ...fresh],
    recentIds: new Set(used.slice(0, markTop).map((u) => getId(u.item))),
  };
}

/** Test hook — wipe stored frecency. */
export function clearFrecency(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  setVersion((v) => v + 1);
}
