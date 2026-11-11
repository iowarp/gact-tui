import { brand } from '@brand';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import type { LatestRelease } from '@clio/core/v3';
import { useRepository } from '@/hooks/use-repository';
import { latestPublishedRelease, ReleaseFeedRateLimited } from '@/lib/github-releases';
import { queryKeys } from '@/lib/query-keys';
import { compareReleaseVersions, displayReleaseVersion } from '@/lib/release-version';
import { QUERY_RETRY_COUNT } from '@/lib/runtime-limits';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { useUpdateChannel, type UpdateChannel } from '@/lib/update-channel';
import { useConnectionSettings } from '@/providers/connection-provider';
import { isUpdateInFlight, useUpdateFlowStore } from '@/store/update-flow-store';
import {
  checkForDesktopUpdate,
  getDesktopUpdateSnapshot,
  installDesktopUpdate,
  subscribeDesktopUpdate,
} from '@/tauri/desktop-updater';

type Repository = ReturnType<typeof useRepository>;

/**
 * The latest published runtime release for one endpoint and channel. Stable
 * reads the server's manifest route; beta reads GitHub's CORS-enabled API, so
 * an older agent needs no upgrade before the UI can discover its next beta.
 * Shared by the version popover and the CLIO menu so both read one cache entry.
 */
export function latestClioReleaseQuery(
  repository: Repository,
  endpoint: string,
  channel: UpdateChannel,
) {
  return {
    queryKey: [...queryKeys.key('latest-release', endpoint), channel] as const,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<LatestRelease> => {
      if (channel === 'stable') return repository.latestRelease(signal);
      if (!brand.agentReleaseUrl) throw new Error('No beta release feed is configured.');
      const release = await latestPublishedRelease(brand.agentReleaseUrl, channel, signal);
      return {
        version: release.tag_name,
        source: `${brand.agentReleaseUrl}/tag/${release.tag_name}`,
        checked_at: new Date().toISOString(),
        degradation: null,
      };
    },
    staleTime: 5 * 60 * 1000,
    // A rate-limited feed answers the same until its reset; retrying only adds a 403.
    retry: (failures: number, error: Error) =>
      !(error instanceof ReleaseFeedRateLimited) && failures < QUERY_RETRY_COUNT,
  };
}

/** Every native entry point uses the same release coordinator. */
export async function runDesktopUpdate(): Promise<void> {
  try {
    await installDesktopUpdate((progress) => useUpdateFlowStore.getState().setProgress(progress));
  } catch (error) {
    useUpdateFlowStore.getState().fail(error instanceof Error ? error.message : String(error));
  }
}

export interface UpdateStatus {
  state: 'unknown' | 'checking' | 'current' | 'available' | 'error' | 'updating';
  /** The newer version, when one was found. */
  targetVersion?: string;
  /** Why a check could not finish, in words. */
  message?: string;
  check: () => void;
  /** Present only where this interface can install the update (the desktop app). */
  install?: () => void;
}

/**
 * Whether the software behind this interface is current, for the CLIO menu's
 * "Up to date" row. In the desktop app it is the signed updater; in a browser
 * it is the connected agent's own release report, and `undefined` when the
 * agent reports none, so the row is left out rather than guessed.
 */
export function useUpdateStatus(runtimeVersion: string | undefined): UpdateStatus | undefined {
  const desktop = inTauri();
  const repository = useRepository();
  const queryClient = useQueryClient();
  const channel = useUpdateChannel();
  const { credentialsReady = true, settings } = useConnectionSettings();
  const snapshot = useSyncExternalStore(
    subscribeDesktopUpdate,
    getDesktopUpdateSnapshot,
    getDesktopUpdateSnapshot,
  );
  const updating = isUpdateInFlight(useUpdateFlowStore((state) => state.step));
  const latest = useQuery({
    ...latestClioReleaseQuery(repository, settings.endpoint, channel),
    enabled: credentialsReady && !desktop,
  });

  if (desktop) {
    const check = () => void checkForDesktopUpdate();
    if (updating) return { state: 'updating', check };
    switch (snapshot.status) {
      case 'available':
        return {
          state: 'available',
          targetVersion: displayReleaseVersion(snapshot.update.version),
          check,
          install: () => void runDesktopUpdate(),
        };
      case 'error':
        return { state: 'error', message: snapshot.message, check };
      default:
        return { state: snapshot.status, check };
    }
  }

  const check = () => {
    void latest.refetch();
    void queryClient.refetchQueries({ queryKey: queryKeys.key('capabilities', settings.endpoint) });
  };
  // The first check holds the row's place so the menu doesn't grow when it answers.
  if (!latest.data && latest.isFetching && runtimeVersion) return { state: 'checking', check };
  const reported = displayReleaseVersion(latest.data?.version ?? undefined);
  if (!reported || latest.data?.degradation || !runtimeVersion) return undefined;
  if (latest.isFetching) return { state: 'checking', check };
  return compareReleaseVersions(runtimeVersion, reported) < 0
    ? { state: 'available', targetVersion: reported, check }
    : { state: 'current', check };
}
