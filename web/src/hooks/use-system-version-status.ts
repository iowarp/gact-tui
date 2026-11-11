import { useQuery } from '@tanstack/react-query';
import { brand } from '@brand';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { vocab } from '@/lib/brand-vocabulary';
import { queryKeys } from '@/lib/query-keys';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { compareReleaseVersions, displayReleaseVersion, releaseTag } from '@/lib/release-version';
import { initializeUpdateChannel, useUpdateChannel } from '@/lib/update-channel';
import { useConnectionSettings } from '@/providers/connection-provider';
import {
  checkForDesktopUpdate,
  getDesktopUpdateSnapshot,
  subscribeDesktopUpdate,
} from '@/tauri/desktop-updater';
import { latestClioReleaseQuery, runDesktopUpdate } from '@/hooks/use-update-status';
import { isUpdateInFlight, useUpdateFlowStore } from '@/store/update-flow-store';
import { agentCheckIssue, desktopCheckIssue } from '@/components/clio/version-check-issue';
import { managedClioVersion } from '@/tauri/clio-update-verification';

// 'unknown' is a REAL state -- no check has run, or the one that ran had
// nothing to compare against (no release feed, a failed fetch). It must
// never be presented as 'current': that would tell someone their software
// is up to date when nobody actually looked.
// 'unavailable' is a check that ran and could not finish (a release still
// being published, an unreachable feed): said in words, never a red alarm.
export type VersionState =
  | 'unknown'
  | 'checking'
  | 'current'
  | 'available'
  | 'unavailable'
  | 'error';
// A per-product row can also be 'browser': this page is the web build served
// to a plain browser, where no signed desktop update check exists. It is a
// settled fact about the runtime, never a pending check.
type RowState = VersionState | 'browser';

/**
 * The web build's own release version, stamped by `vite.config.ts` from the
 * workspace `package.json` -- what a plain browser shows instead of the
 * desktop shell's version, which only exists inside the desktop app.
 */
function webBuildVersion(): string | undefined {
  const stamped: unknown = import.meta.env.VITE_CLIO_WORKSPACE_VERSION;
  return displayReleaseVersion(typeof stamped === 'string' ? stamped : undefined);
}

/**
 * Versions of the interface and the connected runtime, whether either is
 * behind, and the one update action. The left bar's agent menu and the
 * stand-alone `SystemVersionStatus` popover both read it.
 */
export function useSystemVersionStatus() {
  const updateChannel = useUpdateChannel();
  const repository = useRepository();
  const { credentialsReady, settings } = useConnectionSettings();
  // Read once: the runtime never changes under a mounted page. Outside the
  // desktop shell the Tauri version call can never answer, so waiting on it
  // was the endless "Version" spinner in a plain browser.
  const [desktopShell] = useState(inTauri);
  const [desktopVersion, setDesktopVersion] = useState<string>();
  const updateFlowStep = useUpdateFlowStore((state) => state.step);
  const updateFlowAction = useUpdateFlowStore((state) => state.action);
  // Any in-flight step (including the post-restart `reconnecting` window)
  // must lock every update action -- not just the row that started it -- so
  // the person is never shown a still-pressable "Update" button while one is
  // already running (the bug this replaces: only the SAME row disabled).
  const updating = isUpdateInFlight(updateFlowStep) ? updateFlowAction : undefined;
  const snapshot = useSyncExternalStore(
    subscribeDesktopUpdate,
    getDesktopUpdateSnapshot,
    getDesktopUpdateSnapshot,
  );
  const capabilities = useQuery({
    enabled: desktopShell || credentialsReady,
    queryKey: desktopShell
      ? ['owned-runtime-version']
      : queryKeys.key('capabilities', settings.endpoint),
    queryFn: async ({ signal }) =>
      desktopShell
        ? { service: { version: await managedClioVersion(signal) } }
        : repository.capabilities(signal),
  });
  // Stable checks use the server's manifest route. Beta metadata comes from
  // GitHub's CORS-enabled API, so an older connected agent needs no upgrade
  // before the UI can discover its next beta.
  const latestClioRelease = useQuery({
    ...latestClioReleaseQuery(repository, settings.endpoint, updateChannel),
    enabled: credentialsReady && !desktopShell,
  });

  useEffect(() => {
    if (!desktopShell) return;
    let disposed = false;
    void import('@tauri-apps/api/app')
      .then(({ getVersion }) => getVersion())
      .then(
        (version) => {
          if (!disposed) {
            initializeUpdateChannel(version);
            setDesktopVersion(version);
          }
        },
        () => {
          if (!disposed) setDesktopVersion(undefined);
        },
      );
    return () => {
      disposed = true;
    };
  }, [desktopShell]);

  const displayedDesktopVersion = desktopShell
    ? displayReleaseVersion(desktopVersion)
    : webBuildVersion();
  const agentVersion = displayReleaseVersion(capabilities.data?.service?.version);
  useEffect(() => {
    if (!desktopShell) initializeUpdateChannel(agentVersion);
  }, [desktopShell, agentVersion]);
  const latestClioVersion = displayReleaseVersion(latestClioRelease.data?.version ?? undefined);
  // The desktop's own update target comes ONLY from a real signed-manifest
  // check that found something newer -- never a fallback to its own current
  // version (that fallback was the "Up to date at v0.9.4.14" bug: it made
  // "nothing newer was found" indistinguishable from "nothing was checked").
  const desktopTargetVersion = displayReleaseVersion(
    snapshot.status === 'available' ? snapshot.update.version : undefined,
  );
  const desktopUpdateAvailable = desktopShell && snapshot.status === 'available';
  const agentTargetVersion = desktopShell
    ? (desktopTargetVersion ?? displayedDesktopVersion)
    : latestClioVersion;
  const agentVersionKnown = Boolean(agentVersion && agentTargetVersion);
  const agentBehindLatest = Boolean(
    agentVersion &&
      agentTargetVersion &&
      compareReleaseVersions(agentVersion, agentTargetVersion) < 0,
  );
  // Browsers can compare connected versions; installation belongs to the desktop app.
  const latestClioReleaseChecking =
    !desktopShell && credentialsReady && latestClioRelease.isPending;
  const agentIssue = agentCheckIssue(
    latestClioRelease.data,
    latestClioRelease.isError,
    latestClioRelease.error,
  );
  const desktopIssue = desktopCheckIssue(snapshot);
  const agentRowState: VersionState = capabilities.isError
    ? 'error'
    : capabilities.isPending || latestClioReleaseChecking
      ? 'checking'
      : agentBehindLatest
        ? 'available'
        : agentVersionKnown
          ? 'current'
          : (agentIssue?.state ?? 'unknown');
  // DesktopUpdateSnapshot['status'] already IS this component's VersionState
  // vocabulary; only its failure is split into 'unavailable' vs 'error'.
  // In a plain browser there is no desktop update check at all: the row is
  // settled as 'browser' and the overall status rests on the agent alone.
  const desktopRowState: RowState = !desktopShell
    ? 'browser'
    : snapshot.status === 'error'
      ? (desktopIssue?.state ?? 'error')
      : snapshot.status;
  const state: VersionState = (() => {
    if (desktopRowState === 'error' || capabilities.isError) return 'error';
    if (
      // Only the desktop shell waits on its own version; the browser's web
      // build version is stamped at build time and never pending.
      (desktopShell && !displayedDesktopVersion) ||
      capabilities.isPending ||
      latestClioReleaseChecking ||
      (desktopShell && snapshot.status === 'checking')
    ) {
      return 'checking';
    }
    if (desktopShell ? desktopUpdateAvailable : agentBehindLatest) return 'available';
    if (desktopRowState === 'unavailable' || agentRowState === 'unavailable') return 'unavailable';
    if (desktopRowState === 'unknown' || !agentVersionKnown) return 'unknown';
    // In the desktop the runtime's "target" is this app's own version, not a
    // release: a runtime behind it with nothing the check could install is a
    // difference to report, never "update ready".
    if (agentBehindLatest) return 'unavailable';
    return 'current';
  })();

  const recheck = async (): Promise<void> => {
    await Promise.allSettled([
      ...(desktopShell ? [checkForDesktopUpdate()] : []),
      capabilities.refetch(),
      ...(!desktopShell ? [latestClioRelease.refetch()] : []),
    ]);
  };

  const updateAll = (): void => {
    if (desktopShell && desktopUpdateAvailable) void runDesktopUpdate();
    else void recheck();
  };

  const statusLabel = {
    unknown: 'Version status not yet checked',
    checking: 'Checking versions',
    // A browser never checked the web build itself, so only the agent is
    // claimed current there.
    current: desktopShell
      ? `${vocab.product} and ${vocab.agent} are up to date`
      : `${vocab.agent} is up to date`,
    available: 'Software update available',
    unavailable: 'Could not check for updates',
    error: 'Version status needs attention',
  }[state];

  const message: string | undefined =
    (desktopShell ? desktopIssue?.text : undefined) ??
    (agentRowState === 'unavailable' ? agentIssue?.text : undefined) ??
    (capabilities.isError ? 'The connected runtime could not be reached.' : undefined) ??
    (state === 'unavailable' && agentBehindLatest
      ? `Could not check for updates: the runtime (${agentVersion}) is older than this app (${agentTargetVersion}) and no update for it was found.`
      : undefined);
  const versions = [
    {
      label: 'Interface version',
      version: displayedDesktopVersion,
      targetVersion: desktopUpdateAvailable ? desktopTargetVersion : undefined,
      releaseUrl:
        desktopShell && brand.desktopReleaseUrl && displayedDesktopVersion
          ? `${brand.desktopReleaseUrl}/tag/${releaseTag(displayedDesktopVersion)}`
          : undefined,
      testId: 'version-row-desktop',
    },
    {
      label: 'Runtime version',
      version: agentVersion,
      targetVersion:
        agentBehindLatest && (!desktopShell || desktopUpdateAvailable)
          ? agentTargetVersion
          : undefined,
      releaseUrl:
        brand.agentReleaseUrl && agentVersion
          ? `${brand.agentReleaseUrl}/tag/${releaseTag(agentVersion)}`
          : undefined,
      testId: 'version-row-agent',
    },
  ];

  return {
    agentBehindLatest,
    desktopShell,
    displayedDesktopVersion,
    latestClioVersion,
    message,
    recheck,
    settings,
    state,
    statusLabel,
    updateAll,
    updating: desktopShell && Boolean(updating),
    versions,
  };
}

/** Show connected versions and offer installation only in the desktop app. */
