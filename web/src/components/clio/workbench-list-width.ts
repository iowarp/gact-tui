import { useCallback, useRef, useState } from 'react';

export const WORKBENCH_LIST_SHARE_KEY = 'clio.workbench-list-share.v1';

export type WorkbenchListKind = 'list' | 'wide';
type ListShares = Partial<Record<WorkbenchListKind, number>>;

/** Spec `.bc` and `.bc.w`: the list's share of the panel until the user drags it. */
export const DEFAULT_LIST_SHARE: Record<WorkbenchListKind, number> = { list: 0.36, wide: 0.46 };
export const MIN_LIST_WIDTH = 180;
/** The tabs keep this much beside the list, plus the 44 px strip. */
export const MIN_TABS_WIDTH = 280;
const STRIP_WIDTH = 44;
export const MAX_LIST_SHARE = 0.7;

function storedShares(): ListShares {
  if (typeof window === 'undefined') return {};
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(WORKBENCH_LIST_SHARE_KEY) ?? '{}',
    );
    if (!value || typeof value !== 'object') return {};
    const shares: ListShares = {};
    for (const kind of ['list', 'wide'] as const) {
      const share = (value as Record<string, unknown>)[kind];
      if (typeof share === 'number' && share > 0 && share <= MAX_LIST_SHARE) shares[kind] = share;
    }
    return shares;
  } catch {
    return {};
  }
}

/** The widest the list may be in a panel this wide: the tabs keep their minimum. */
function maxListWidth(panelWidth: number): number {
  return Math.max(
    MIN_LIST_WIDTH,
    Math.min(panelWidth * MAX_LIST_SHARE, panelWidth - STRIP_WIDTH - MIN_TABS_WIDTH),
  );
}

/**
 * The list column's width as a share of the panel: the spec's default until the
 * user drags or arrows its edge, then theirs. It is stored only when a resize
 * ends, never on load or open, like the workbench's own width.
 */
export function useWorkbenchListWidth(kind: WorkbenchListKind) {
  const [shares, setShares] = useState(storedShares);
  // Every change goes through here, so this always holds what is shown.
  const latest = useRef(shares);
  const share = shares[kind] ?? DEFAULT_LIST_SHARE[kind];
  const sectionRef = useRef<HTMLElement>(null);
  const changed = useRef(false);

  const resizeTo = useCallback(
    (width: number) => {
      const panel = sectionRef.current?.parentElement?.clientWidth;
      if (!panel) return;
      const clamped = Math.min(maxListWidth(panel), Math.max(MIN_LIST_WIDTH, width));
      const next = Math.round((clamped / panel) * 1000) / 1000;
      changed.current = true;
      latest.current =
        latest.current[kind] === next ? latest.current : { ...latest.current, [kind]: next };
      setShares(latest.current);
    },
    [kind],
  );

  const commit = useCallback(() => {
    if (!changed.current) return;
    changed.current = false;
    window.localStorage.setItem(WORKBENCH_LIST_SHARE_KEY, JSON.stringify(latest.current));
  }, []);

  const reset = useCallback(() => {
    const next = { ...latest.current };
    delete next[kind];
    latest.current = next;
    setShares(next);
    window.localStorage.setItem(WORKBENCH_LIST_SHARE_KEY, JSON.stringify(next));
  }, [kind]);

  return { share, sectionRef, resizeTo, commit, reset };
}
