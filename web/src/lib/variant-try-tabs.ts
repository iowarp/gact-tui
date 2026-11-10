import type { VariantRun } from '@clio/core/v3';
import { useMemo, useSyncExternalStore } from 'react';
import { useLiveStore } from '@/store/live-store';
import { tryNoun, type VariantTabView } from './variant-runs';

/** Opens a run's tries as workbench tabs and brings one to the front. */
export const OPEN_VARIANT_TRY_EVENT = 'clio:open-variant-try';

export interface VariantTryTabRef {
  tryIndex: number;
  label: string;
}

export interface OpenVariantTryDetail {
  sessionId: string;
  variantsId: string;
  /** Every try of the run, in order: each gets its tab. */
  tries: readonly VariantTryTabRef[];
  /** The try brought to the front. */
  tryIndex: number;
}

export function openVariantTries(detail: OpenVariantTryDetail): void {
  window.dispatchEvent(new CustomEvent(OPEN_VARIANT_TRY_EVENT, { detail }));
}

export function variantTryTabId(variantsId: string, tryIndex: number): string {
  return `variant-try:${variantsId}:${tryIndex}`;
}

function formatScore(score: number): string {
  return score.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** A try's state in words, when it has one to say: `running`, `failed`, `score 0.82`. */
export function variantTryState(tab: VariantTabView): string | undefined {
  if (tab.state === 'running') return 'running';
  if (tab.state === 'failed') return 'failed';
  if (tab.score !== undefined) return `score ${formatScore(tab.score)}`;
  return undefined;
}

// The try each run's workbench tab is showing, so the pick card follows it.
const shown = new Map<string, number>();
const listeners = new Set<() => void>();

export function setShownVariantTry(variantsId: string, tryIndex: number): void {
  if (shown.get(variantsId) === tryIndex) return;
  shown.set(variantsId, tryIndex);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The try the workbench last showed for this run, if any. */
export function useShownVariantTry(variantsId: string): number | undefined {
  return useSyncExternalStore(
    subscribe,
    () => shown.get(variantsId),
    () => undefined,
  );
}

// Runs whose tries already opened on their own: a pick opens them once, never again.
const opened = new Set<string>();

export function claimVariantTriesOpen(variantsId: string): boolean {
  if (opened.has(variantsId)) return false;
  opened.add(variantsId);
  return true;
}

interface TryTabLike {
  id: string;
  kind: string;
  variantsId?: string;
  tryIndex?: number;
}

function liveTryLabel(run: VariantRun | undefined, tryIndex: number): string | undefined {
  const item = run?.tries.find((candidate) => candidate.try_index === tryIndex);
  if (!run || !item) return undefined;
  const label = `${tryNoun(run)} ${tryIndex + 1}`;
  const state =
    item.state === 'running'
      ? 'running'
      : item.state === 'failed'
        ? 'failed'
        : item.score !== undefined && item.score !== null
          ? `score ${formatScore(item.score)}`
          : undefined;
  return state ? `${label}, ${state}` : label;
}

/**
 * The try tabs' names as their runs stand now (`Try 2, score 0.82`), by tab id.
 * It re-renders only when a name changes, never on a streaming try's text.
 */
export function useVariantTryTabLabels(
  tabs: readonly TryTabLike[],
): ReadonlyMap<string, string> | undefined {
  const tries = tabs.filter((tab) => tab.kind === 'variant-try' && tab.variantsId);
  const joined = useLiveStore((state) =>
    tries.length === 0
      ? ''
      : tries
          .map(
            (tab) =>
              `${tab.id}\u0000${liveTryLabel(state.entities.variant_runs[tab.variantsId!], tab.tryIndex ?? 0) ?? ''}`,
          )
          .join('\u0001'),
  );
  return useMemo(() => {
    if (!joined) return undefined;
    const labels = new Map<string, string>();
    for (const row of joined.split('\u0001')) {
      const [id, label] = row.split('\u0000');
      if (id && label) labels.set(id, label);
    }
    return labels;
  }, [joined]);
}
