import { useQuery } from '@tanstack/react-query';
import { brand } from '@brand';
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  CircleDashedIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useRepository } from '@/hooks/use-repository';
import { vocab } from '@/lib/brand-vocabulary';
import { queryKeys } from '@/lib/query-keys';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { compareReleaseVersions, displayReleaseVersion, releaseTag } from '@/lib/release-version';
import { latestPublishedRelease } from '@/lib/github-releases';
import { initializeUpdateChannel, useUpdateChannel } from '@/lib/update-channel';
import { cn } from '@/lib/utils';
import { useConnectionSettings } from '@/providers/connection-provider';
import {
  checkForDesktopUpdate,
  getDesktopUpdateSnapshot,
  installDesktopUpdate,
  subscribeDesktopUpdate,
} from '@/tauri/desktop-updater';
import { restartClio, updateManagedClio } from '@/tauri/managed-backend';
import {
  clearPendingUpdateMarker,
  isUpdateInFlight,
  useUpdateFlowStore,
  writePendingUpdateMarker,
  type UpdateAction,
} from '@/store/update-flow-store';
import { agentCheckIssue, desktopCheckIssue } from './version-check-issue';

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

/**
 * Drives one "Update all" click through the real state machine
 * (`useUpdateFlowStore`), persisting the restart marker before any call that
 * disconnects the backend or replaces the process. Module-level (not a
 * closure inside `SystemVersionStatus`) so its `Date.now()` calls happen only
 * when a person actually triggers an update -- never reachable from render.
 */
async function runUpdate(
  action: UpdateAction,
  {
    desktopTargetVersion,
    latestClioVersion,
  }: { desktopTargetVersion?: string; latestClioVersion?: string },
): Promise<void> {
  const flow = useUpdateFlowStore.getState();
  const version = action === 'desktop' ? desktopTargetVersion : latestClioVersion;
  flow.start(action, version);
  try {
    if (action === 'agent') {
      if (!latestClioVersion)
        throw new Error(`No newer ${vocab.agent} release was found to update to.`);
      // Persisted BEFORE the restart-triggering call below: `update_clio`
      // disconnects the current backend immediately, then (restartApp:
      // true) replaces the whole process a moment after success. Nothing
      // in this session survives that to report "reconnecting" itself --
      // the next boot reads this marker instead (see `UpdateRestartRecovery`).
      writePendingUpdateMarker({ action, version: latestClioVersion, startedAt: Date.now() });
      flow.setStep('installing');
      await updateManagedClio(releaseTag(latestClioVersion), {
        restartApp: true,
        onProgress: (line) => useUpdateFlowStore.getState().appendLine(line),
      });
      flow.setStep('restarting');
      return;
    }
    if (action === 'both' && latestClioVersion) {
      writePendingUpdateMarker({ action, version: latestClioVersion, startedAt: Date.now() });
      flow.setStep('installing');
      await updateManagedClio(releaseTag(latestClioVersion), {
        restartApp: false,
        onProgress: (line) => useUpdateFlowStore.getState().appendLine(line),
      });
    } else if (action === 'desktop') {
      writePendingUpdateMarker({ action, version: desktopTargetVersion, startedAt: Date.now() });
    }
    flow.setStep('downloading');
    await installDesktopUpdate((progress) => useUpdateFlowStore.getState().setProgress(progress));
    flow.setStep('restarting');
  } catch (error) {
    clearPendingUpdateMarker();
    if (action === 'agent' || action === 'both') {
      await restartClio().catch(() => undefined);
    }
    useUpdateFlowStore.getState().fail(error instanceof Error ? error.message : String(error));
  }
}

/** One bottom-bar control for checking and updating both installed products. */
export function SystemVersionStatus() {
  const updateChannel = useUpdateChannel();
  const repository = useRepository();
  const { credentialsReady, isManagedConnection, settings } = useConnectionSettings();
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
    enabled: credentialsReady,
    queryKey: queryKeys.key('capabilities', settings.endpoint),
    queryFn: ({ signal }) => repository.capabilities(signal),
  });
  // Stable checks use the server's manifest route. Beta metadata comes from
  // GitHub's CORS-enabled API, so an older connected agent needs no upgrade
  // before the UI can discover its next beta.
  const latestClioRelease = useQuery({
    enabled: credentialsReady,
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
  const agentVersionKnown = Boolean(agentVersion && latestClioVersion);
  const agentBehindLatest = Boolean(
    agentVersion &&
      latestClioVersion &&
      compareReleaseVersions(agentVersion, latestClioVersion) < 0,
  );
  // Knowing the agent is behind is a fact; being ALLOWED to push a remote
  // update is a separate, narrower permission (only a managed connection can).
  const agentUpdateActionable = agentBehindLatest && isManagedConnection;
  const latestClioReleaseChecking = credentialsReady && latestClioRelease.isPending;
  const agentIssue = agentCheckIssue(latestClioRelease.data, latestClioRelease.isError);
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
  const state = useMemo<VersionState>(() => {
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
  }, [
    agentBehindLatest,
    agentRowState,
    agentVersionKnown,
    desktopRowState,
    capabilities.isError,
    capabilities.isPending,
    desktopShell,
    desktopUpdateAvailable,
    displayedDesktopVersion,
    latestClioReleaseChecking,
    snapshot.status,
  ]);

  const performUpdate = (action: UpdateAction) =>
    runUpdate(action, { desktopTargetVersion, latestClioVersion });

  const recheck = async (): Promise<void> => {
    await Promise.allSettled([
      ...(desktopShell ? [checkForDesktopUpdate()] : []),
      capabilities.refetch(),
      latestClioRelease.refetch(),
    ]);
  };

  const updateAll = (): void => {
    if (desktopUpdateAvailable && agentUpdateActionable) {
      void performUpdate('both');
    } else if (desktopUpdateAvailable) {
      void performUpdate('desktop');
    } else if (agentUpdateActionable) {
      void performUpdate('agent');
    } else {
      void recheck();
    }
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
  const systemActionLabel =
    state === 'available'
      ? 'Update all'
      : state === 'checking'
        ? 'Checking…'
        : state === 'error' || state === 'unavailable'
          ? 'Recheck'
          : state === 'unknown'
            ? 'Check now'
            : 'Up to date';

  return (
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
          <VersionStateIcon state={state} />
          <span>{displayedDesktopVersion ? `v${displayedDesktopVersion}` : 'Version'}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3" side="top">
        <div className="flex items-center justify-between gap-3 border-b pb-3">
          <span className="font-semibold">System Version</span>
          <VersionAction
            disabled={Boolean(updating) || state === 'checking'}
            label={systemActionLabel}
            onClick={updateAll}
            state={state}
            updating={Boolean(updating)}
          />
        </div>
        <VersionRow
          currentVersion={agentVersion}
          disabled={Boolean(updating)}
          label={vocab.agent}
          onRecheck={() => void recheck()}
          onUpdate={agentUpdateActionable ? () => void performUpdate('agent') : undefined}
          releaseUrl={
            brand.agentReleaseUrl && agentVersion
              ? `${brand.agentReleaseUrl}/tag/${releaseTag(agentVersion)}`
              : undefined
          }
          note={agentRowState === 'unavailable' ? agentIssue?.text : undefined}
          state={agentRowState}
          targetVersion={agentBehindLatest ? latestClioVersion : undefined}
          testId="version-row-agent"
          updating={updating === 'agent' || updating === 'both'}
        />
        <VersionRow
          currentVersion={displayedDesktopVersion}
          disabled={Boolean(updating)}
          label={vocab.product}
          onRecheck={() => void recheck()}
          onUpdate={desktopUpdateAvailable ? () => void performUpdate('desktop') : undefined}
          releaseUrl={
            brand.desktopReleaseUrl && displayedDesktopVersion
              ? `${brand.desktopReleaseUrl}/tag/${releaseTag(displayedDesktopVersion)}`
              : undefined
          }
          note={desktopShell ? desktopIssue?.text : 'Update checks run in the desktop app.'}
          state={desktopRowState}
          targetVersion={desktopUpdateAvailable ? desktopTargetVersion : undefined}
          testId="version-row-desktop"
          updating={updating === 'desktop' || updating === 'both'}
        />
      </PopoverContent>
    </Popover>
  );
}

/** {label, badge className} for each honest version state -- Badge variants, never a fallback to "current". */
const VERSION_STATE_PRESENTATION: Record<RowState, { label: string; className: string }> = {
  unknown: { label: 'Not checked', className: 'text-muted-foreground border-border bg-muted/50' },
  checking: {
    label: 'Checking…',
    className: 'text-info-foreground dark:text-info border-info/30 bg-info/10',
  },
  current: { label: 'Up to date', className: 'text-success border-success/30 bg-success/10' },
  available: {
    label: 'Update available',
    className: 'text-warning border-warning/30 bg-warning/10',
  },
  unavailable: {
    label: 'Could not check',
    className: 'text-muted-foreground border-border bg-muted/50',
  },
  error: {
    label: 'Needs attention',
    className: 'text-destructive border-destructive/30 bg-destructive/10',
  },
  browser: {
    label: 'Web build',
    className: 'text-muted-foreground border-border bg-muted/50',
  },
};

/** The per-product status readout -- a real Badge variant per state, distinct from the action button. */
function VersionStateBadge({ state }: { state: RowState }) {
  const { label, className } = VERSION_STATE_PRESENTATION[state];
  return (
    <Badge className={cn('gap-1', className)} variant="outline">
      {state === 'checking' ? (
        <LoaderCircleIcon aria-hidden="true" className="size-3 motion-safe:animate-spin" />
      ) : null}
      {label}
    </Badge>
  );
}

function VersionRow({
  currentVersion,
  disabled,
  label,
  note,
  onRecheck,
  onUpdate,
  releaseUrl,
  state,
  targetVersion,
  testId,
  updating,
}: {
  currentVersion?: string;
  /**
   * True while ANY update is running, even one this row did not start --
   * both rows must lock while one update is in flight, since running two at
   * once was never a real, supported combination on its own (a bug the
   * previous same-row-only `updating` disable let through).
   */
  disabled?: boolean;
  label: string;
  /** Why the check could not finish, or what needs the person, in plain words. */
  note?: string;
  onRecheck: () => void;
  onUpdate?: () => void;
  releaseUrl?: string;
  state: RowState;
  targetVersion?: string;
  /** Stable hook for scoping assertions to ONE row -- two rows can be in
   * different states at once (e.g. desktop checking, agent current). */
  testId: string;
  /** True while THIS row's own update is the one actively running -- drives its spinner. */
  updating: boolean;
}) {
  // Offer an action only when there is one: install a real update, or
  // retry a check that came back unknown/failed. A settled "current" row
  // gets a status badge and nothing to click.
  const action =
    onUpdate ??
    (state === 'error' || state === 'unknown' || state === 'unavailable' ? onRecheck : undefined);
  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-3 [&:not(:last-child)]:border-b"
      data-testid={testId}
    >
      {releaseUrl ? (
        <ExternalLink
          className="flex min-w-0 items-center gap-1.5 font-medium hover:underline"
          href={releaseUrl}
        >
          <span className="truncate">{label}</span>
          <ExternalLinkIcon aria-hidden="true" className="size-3" />
        </ExternalLink>
      ) : (
        <span className="flex min-w-0 items-center gap-1.5 font-medium">
          <span className="truncate">{label}</span>
        </span>
      )}
      <div className="flex items-center gap-2">
        <VersionStateBadge state={state} />
        {action ? (
          <Button disabled={disabled || updating} onClick={action} size="sm" variant="outline">
            {updating ? (
              <LoaderCircleIcon aria-hidden="true" className="size-3.5 motion-safe:animate-spin" />
            ) : null}
            {onUpdate ? 'Update' : 'Recheck'}
          </Button>
        ) : null}
      </div>
      <p className="font-mono text-xs text-muted-foreground">
        {currentVersion ? `v${currentVersion}` : 'Not checked'}
        {targetVersion ? ` → v${targetVersion}` : ''}
      </p>
      {note ? <p className="col-span-2 mt-1 text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

function VersionAction({
  disabled,
  label,
  onClick,
  state,
  updating,
}: {
  disabled: boolean;
  label: string;
  onClick: () => void;
  state: VersionState;
  updating: boolean;
}) {
  return (
    <Button
      className={cn(
        'gap-1.5',
        state === 'current' && 'border-success/40 text-success hover:text-success',
        state === 'available' && 'border-warning/40 text-warning hover:text-warning',
        (state === 'unknown' || state === 'unavailable') &&
          'border-muted-foreground/30 text-muted-foreground',
        state === 'error' && 'border-destructive/40 text-destructive hover:text-destructive',
      )}
      disabled={disabled}
      onClick={onClick}
      size="sm"
      variant="outline"
    >
      {updating || state === 'checking' ? (
        <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
      ) : (
        <VersionStateIcon state={state} />
      )}
      {label}
    </Button>
  );
}

function VersionStateIcon({ state }: { state: VersionState }) {
  if (state === 'checking') {
    return <LoaderCircleIcon aria-hidden="true" className="size-4 animate-spin text-warning" />;
  }
  if (state === 'current') {
    return <CheckCircle2Icon aria-hidden="true" className="size-4 text-success" />;
  }
  if (state === 'unknown') {
    return <CircleDashedIcon aria-hidden="true" className="size-4 text-muted-foreground" />;
  }
  if (state === 'unavailable') {
    return <CircleAlertIcon aria-hidden="true" className="size-4 text-muted-foreground" />;
  }
  return (
    <CircleAlertIcon
      aria-hidden="true"
      className={cn('size-4', state === 'available' ? 'text-warning' : 'text-destructive')}
    />
  );
}
