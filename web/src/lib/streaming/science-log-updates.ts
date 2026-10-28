import {
  decodeEventEnvelope,
  decodeScienceEntry,
  type ScienceEntry,
  type ScienceLog,
  type TransportFrame,
} from '@clio/core/v3';
import type { QueryClient } from '@tanstack/react-query';
import { scienceLogQueryKey } from '@/hooks/use-science-log';
import { queryKeys } from '@/lib/query-keys';
import { FrameBatcher, type FrameClock } from './frame-batcher';

/** A `science.entry` frame's entry, or `undefined` for any other frame. */
export function scienceEntryForFrame(frame: TransportFrame): ScienceEntry | undefined {
  if (frame.eventName !== 'science.entry') return undefined;
  try {
    return decodeScienceEntry(decodeEventEnvelope(frame.data).payload);
  } catch {
    // Frame reduction owns malformed-envelope gap reporting, including this event.
    return undefined;
  }
}

/** The log with `entries` merged in by id; `undefined` when the log cannot hold them yet. */
export function mergeScienceEntries(
  log: ScienceLog | undefined,
  entries: readonly ScienceEntry[],
): ScienceLog | undefined {
  if (!log?.in_study) return undefined;
  const branches = new Set(log.branches.map((branch) => branch.session_id));
  if (entries.some((entry) => entry.branch && !branches.has(entry.branch))) return undefined;
  const merged = [...log.entries];
  for (const entry of entries) {
    const index = merged.findIndex((row) => row.id === entry.id);
    if (index >= 0) merged[index] = entry;
    else merged.push(entry);
  }
  return { ...log, entries: merged };
}

/**
 * Merges live entries into the session's science log once per display frame,
 * then re-reads the log so statuses, new branches and views come from the
 * server. A log that cannot hold an entry yet (no study read, an unknown branch)
 * is only re-read. Every live source a view reads of the entries' studies
 * (`study://…`) is re-read too, so a view shows the new entry without the agent
 * rebuilding it.
 */
export class ScienceEntryMerger {
  private readonly batcher: FrameBatcher<ScienceEntry>;

  public constructor(
    queryClient: Pick<QueryClient, 'getQueryData' | 'setQueryData' | 'invalidateQueries'>,
    endpoint: string,
    sessionId: string,
    clock?: FrameClock,
  ) {
    const key = scienceLogQueryKey(endpoint, sessionId);
    this.batcher = new FrameBatcher<ScienceEntry>((entries) => {
      const merged = mergeScienceEntries(queryClient.getQueryData<ScienceLog>(key), entries);
      if (merged) queryClient.setQueryData(key, merged);
      void queryClient.invalidateQueries({ queryKey: key });
      for (const study of new Set(entries.map((entry) => entry.study).filter(Boolean)))
        void queryClient.invalidateQueries({
          queryKey: queryKeys.key('study-source', endpoint, study),
        });
    }, clock);
  }

  public push(frame: TransportFrame): void {
    const entry = scienceEntryForFrame(frame);
    if (entry) this.batcher.push(entry);
  }

  public stop(options: { flush: boolean }): void {
    this.batcher.stop(options);
  }
}
