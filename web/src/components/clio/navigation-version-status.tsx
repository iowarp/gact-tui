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
import { compareReleaseVersions, displayReleaseVersion, releaseTag } from '@/lib/release-version';
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

// 'unknown' is a REAL state -- no check has run, or the one that ran had
// nothing to compare against (no release feed, a failed fetch). It must
// never be presented as 'current': that would tell someone their software
// is up to date when nobody actually looked.
type VersionState = 'unknown' | 'checking' | 'current' | 'available' | 'error';

/**
 * Drives one "Update all" click through the real state machine
 * (`useUpdateFlowStore`), persisting the restart marker before any call that
 * disconnects the backend or replaces the process. Module-level (not a
 * closure inside `SystemVersionStatus`) so its `Date.now()` calls happen only
 * when a person actually triggers an update -- never reachable from render.
 */
async function runUpdate(
  action: UpdateAction,
  { desktopTargetVersion, latestClioVersion }: { desktopTargetVersion?: string; latestClioVersion?: string },
): Promise<void> {
  const flow = useUpdateFlowStore.getState();
  const version = action === 'desktop' ? desktopTargetVersion : latestClioVersion;
  flow.start(action, version);
  try {
    if (action === 'agent') {
      if (!latestClioVersion) throw new Error(`No newer ${vocab.agent} release was found to update to.`);
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
  const repository = useRepository();
  const { credentialsReady, isManagedConnection, settings } = useConnectionSettings();
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
  // The latest published CLIO release. The browser (and the desktop webview,
  // which is subject to the same fetch CORS rules) cannot reach a GitHub
  // release asset directly -- GitHub sends no CORS headers on it -- so the
  // CONNECTED SERVER does that fetch (GET /v1/system/latest-release) and
  // hands back just the version this row needs to compare against.
  const latestClioRelease = useQuery({
    enabled: credentialsReady,
    queryKey: queryKeys.key('latest-release', settings.endpoint),
    queryFn: ({ signal }) => repository.latestRelease(signal),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    let disposed = false;
    void import('@tauri-apps/api/app')
      .then(({ getVersion }) => getVersion())
      .then(
        (version) => {
          if (!disposed) setDesktopVersion(version);
        },
        () => {
          if (!disposed) setDesktopVersion(undefined);
        },
      );
    return () => {
      disposed = true;
    };
  }, []);

  const displayedDesktopVersion = displayReleaseVersion(desktopVersion);
  const agentVersion = displayReleaseVersion(capabilities.data?.service?.version);
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
    agentVersion && latestClioVersion && compareReleaseVersions(agentVersion, latestClioVersion) < 0,
  );
  // Knowing the agent is behind is a fact; being ALLOWED to push a remote
  // update is a separate, narrower permission (only a managed connection can).
  const agentUpdateActionable = agentBehindLatest && isManagedConnection;
  const latestClioReleaseChecking = credentialsReady && latestClioRelease.isPending;
  const state = useMemo<VersionState>(() => {
    if (snapshot.status === 'error' || capabilities.isError) return 'error';
    if (
      !displayedDesktopVersion ||
      capabilities.isPending ||
      latestClioReleaseChecking ||
      snapshot.status === 'checking'
    ) {
      return 'checking';
    }
    if (desktopUpdateAvailable || agentBehindLatest) return 'available';
    if (snapshot.status === 'unknown' || !agentVersionKnown) return 'unknown';
    return 'current';
  }, [
    agentBehindLatest,
    agentVersionKnown,
    capabilities.isError,
    capabilities.isPending,
    desktopUpdateAvailable,
    displayedDesktopVersion,
    latestClioReleaseChecking,
    snapshot.status,
  ]);

  const performUpdate = (action: UpdateAction) => runUpdate(action, { desktopTargetVersion, latestClioVersion });

  const recheck = async (): Promise<void> => {
    await Promise.allSettled([
      checkForDesktopUpdate(),
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
    current: `${vocab.product} and ${vocab.agent} are up to date`,
    available: 'Software update available',
    error: 'Version status needs attention',
  }[state];
  const systemActionLabel =
    state === 'available'
      ? 'Update all'
      : state === 'checking'
        ? 'Checking…'
        : state === 'error'
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
          className="h-6 gap-1.5 px-1.5 font-mono text-[10px] text-muted-foreground"
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
          state={
            capabilities.isError
              ? 'error'
              : capabilities.isPending || latestClioReleaseChecking
                ? 'checking'
                : agentBehindLatest
                  ? 'available'
                  : agentVersionKnown
                    ? 'current'
                    : 'unknown'
          }
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
          // DesktopUpdateSnapshot['status'] already IS this component's
          // VersionState vocabulary -- no fall-through-to-current mapping.
          state={snapshot.status}
          targetVersion={desktopUpdateAvailable ? desktopTargetVersion : undefined}
          testId="version-row-desktop"
          updating={updating === 'desktop' || updating === 'both'}
        />
      </PopoverContent>
    </Popover>
  );
}

/** {label, badge className} for each honest version state -- Badge variants, never a fallback to "current". */
const VERSION_STATE_PRESENTATION: Record<VersionState, { label: string; className: string }> = {
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
  error: {
    label: 'Needs attention',
    className: 'text-destructive border-destructive/30 bg-destructive/10',
  },
};

/** The per-product status readout -- a real Badge variant per state, distinct from the action button. */
function VersionStateBadge({ state }: { state: VersionState }) {
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
  onRecheck: () => void;
  onUpdate?: () => void;
  releaseUrl?: string;
  state: VersionState;
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
  const action = onUpdate ?? (state === 'error' || state === 'unknown' ? onRecheck : undefined);
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
        state === 'unknown' && 'border-muted-foreground/30 text-muted-foreground',
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
  return (
    <CircleAlertIcon
      aria-hidden="true"
      className={cn('size-4', state === 'available' ? 'text-warning' : 'text-destructive')}
    />
  );
}
