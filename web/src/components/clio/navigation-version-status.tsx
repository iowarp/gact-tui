import { useQuery } from '@tanstack/react-query';
import { brand } from '@brand';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useRepository } from '@/hooks/use-repository';
import { vocab } from '@/lib/brand-vocabulary';
import { queryKeys } from '@/lib/query-keys';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { compareReleaseVersions, displayReleaseVersion, releaseTag } from '@/lib/release-version';
import { latestPublishedRelease, ReleaseFeedRateLimited } from '@/lib/github-releases';
import { QUERY_RETRY_COUNT } from '@/lib/runtime-limits';
import { initializeUpdateChannel, useUpdateChannel } from '@/lib/update-channel';
import { useConnectionSettings } from '@/providers/connection-provider';
import {
  checkForDesktopUpdate,
  getDesktopUpdateSnapshot,
  installDesktopUpdate,
  subscribeDesktopUpdate,
} from '@/tauri/desktop-updater';
import { isUpdateInFlight, useUpdateFlowStore } from '@/store/update-flow-store';
import { agentCheckIssue, desktopCheckIssue } from './version-check-issue';
import { managedClioVersion } from '@/tauri/clio-update-verification';
import { ProductUpdateIcon, ProductUpdateSummary } from './product-update-summary';

// 'unknown' is a REAL state -- no check has run, or the one that ran had
// nothing to compare against (no release feed, a failed fetch). It must
// never be presented as 'current': that would tell someone their software
// is up to date when nobody actually looked.
// 'unavailable' is a check that ran and could not finish (a release still
// being published, an unreachable feed): said in words, never a red alarm.
type VersionState = 'unknown' | 'checking' | 'current' | 'available' | 'unavailable' | 'error';
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

/** Every native entry point uses the same release coordinator. */
async function runUpdate(): Promise<void> {
  try {
    await installDesktopUpdate((progress) => useUpdateFlowStore.getState().setProgress(progress));
  } catch (error) {
    useUpdateFlowStore.getState().fail(error instanceof Error ? error.message : String(error));
  }
}

/** One bottom-bar control for checking and updating both installed products. */
export function SystemVersionStatus() {
  const updateChannel = useUpdateChannel();
  const repository = useRepository();
  const { credentialsReady, settings } = useConnectionSettings();
  // Read once: the runtime never changes under a mounted page. Outside the
  // desktop shell the Tauri version call can never answer, so waiting on it
  // was the endless "Version" spinner in a plain browser.
  const [desktopShell] = useState(inTauri);
  const [desktopVersion, setDesktopVersion] = useState<string>();
  const [serviceUpdateOpen, setServiceUpdateOpen] = useState(false);
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
    enabled: credentialsReady && !desktopShell,
    queryKey: [...queryKeys.key('latest-release', settings.endpoint), updateChannel],
    queryFn: async ({ signal }) => {
      if (updateChannel === 'stable') return repository.latestRelease(signal);
      if (!brand.agentReleaseUrl) throw new Error('No beta release feed is configured.');
      const release = await latestPublishedRelease(brand.agentReleaseUrl, updateChannel, signal);
      return {
        version: release.tag_name,
        source: `${brand.agentReleaseUrl}/tag/${release.tag_name}`,
        checked_at: new Date().toISOString(),
        degradation: null,
      };
    },
    staleTime: 5 * 60 * 1000,
    // A rate-limited feed answers the same until its reset; retrying only adds a 403.
    retry: (failures, error) =>
      !(error instanceof ReleaseFeedRateLimited) && failures < QUERY_RETRY_COUNT,
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
  const desktopUpdateAvailable = snapshot.status === 'available';
  const agentTargetVersion = desktopShell
    ? (desktopTargetVersion ?? displayedDesktopVersion)
    : latestClioVersion;
  const agentVersionKnown = Boolean(agentVersion && agentTargetVersion);
  const agentBehindLatest = Boolean(
    agentVersion &&
      agentTargetVersion &&
      compareReleaseVersions(agentVersion, agentTargetVersion) < 0,
  );
  // Knowing the agent is behind is a fact; being ALLOWED to push a remote
  // update is a separate, narrower permission (only a managed connection can).
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
      snapshot.status === 'checking'
    ) {
      return 'checking';
    }
    if (desktopUpdateAvailable || agentBehindLatest) return 'available';
    if (desktopRowState === 'unavailable' || agentRowState === 'unavailable') return 'unavailable';
    if (desktopRowState === 'unknown' || !agentVersionKnown) return 'unknown';
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
    if (desktopShell && desktopUpdateAvailable) void runUpdate();
    else if (!desktopShell && agentBehindLatest) setServiceUpdateOpen(true);
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

  return (
    <>
      <Popover
        onOpenChange={(open) => {
          if (open) void recheck();
        }}
      >
        <PopoverTrigger asChild>
          <Button
            aria-label={statusLabel}
            className="h-6 gap-1.5 px-1.5 font-mono text-[0.625rem] text-muted-foreground"
            size="xs"
            title={statusLabel}
            variant="ghost"
          >
            <ProductUpdateIcon state={state} />
            <span>{displayedDesktopVersion ? `v${displayedDesktopVersion}` : 'Version'}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-3" side="top">
          <p className="mb-4 text-sm font-semibold">Updates</p>
          <ProductUpdateSummary
            state={state}
            updating={Boolean(updating)}
            onCheck={recheck}
            onUpdate={updateAll}
            message={
              desktopIssue?.text ??
              (agentRowState === 'unavailable' ? agentIssue?.text : undefined) ??
              (capabilities.isError ? 'The connected runtime could not be reached.' : undefined)
            }
            versions={[
              {
                label: desktopShell ? 'Desktop app' : 'Web interface',
                version: displayedDesktopVersion,
                targetVersion: desktopUpdateAvailable ? desktopTargetVersion : undefined,
                releaseUrl:
                  brand.desktopReleaseUrl && displayedDesktopVersion
                    ? `${brand.desktopReleaseUrl}/tag/${releaseTag(displayedDesktopVersion)}`
                    : undefined,
                testId: 'version-row-desktop',
              },
              {
                label: 'Runtime',
                version: agentVersion,
                targetVersion: agentBehindLatest ? agentTargetVersion : undefined,
                releaseUrl:
                  brand.agentReleaseUrl && agentVersion
                    ? `${brand.agentReleaseUrl}/tag/${releaseTag(agentVersion)}`
                    : undefined,
                testId: 'version-row-agent',
              },
            ]}
          />
        </PopoverContent>
      </Popover>
      <Dialog open={serviceUpdateOpen} onOpenChange={setServiceUpdateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update {vocab.agent}</DialogTitle>
            <DialogDescription>
              Update the installation serving this workspace. Its runtime and browser interface come
              from the same release.
            </DialogDescription>
          </DialogHeader>
          <p className="break-all text-sm">{settings.label ?? settings.endpoint}</p>
          <p className="text-sm text-muted-foreground">
            This browser cannot run the host’s installer. Use the installation’s existing location
            and the selected release, then reload the workspace after the service restarts.
          </p>
          {brand.agentReleaseUrl && latestClioVersion ? (
            <Button asChild>
              <ExternalLink href={`${brand.agentReleaseUrl}/tag/${releaseTag(latestClioVersion)}`}>
                Open {vocab.agent} {latestClioVersion}
              </ExternalLink>
            </Button>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
