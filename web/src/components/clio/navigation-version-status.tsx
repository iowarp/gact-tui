import { useQuery } from '@tanstack/react-query';
import { brand } from '@brand';
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
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

type VersionState = 'checking' | 'current' | 'available' | 'error';
type UpdateAction = 'desktop' | 'agent' | 'both';

/** One bottom-bar control for checking and updating both installed products. */
export function SystemVersionStatus() {
  const repository = useRepository();
  const { credentialsReady, isManagedConnection, settings } = useConnectionSettings();
  const [desktopVersion, setDesktopVersion] = useState<string>();
  const [updating, setUpdating] = useState<UpdateAction>();
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
  const targetVersion = displayReleaseVersion(
    snapshot.status === 'available' ? snapshot.update.version : desktopVersion,
  );
  const desktopUpdateAvailable = snapshot.status === 'available';
  const agentUpdateAvailable = Boolean(
    isManagedConnection &&
      agentVersion &&
      targetVersion &&
      compareReleaseVersions(agentVersion, targetVersion) < 0,
  );
  const state = useMemo<VersionState>(() => {
    if (snapshot.status === 'error' || capabilities.isError) return 'error';
    if (!displayedDesktopVersion || capabilities.isPending || snapshot.status === 'checking') {
      return 'checking';
    }
    if (desktopUpdateAvailable || agentUpdateAvailable) return 'available';
    return 'current';
  }, [
    agentUpdateAvailable,
    capabilities.isError,
    capabilities.isPending,
    desktopUpdateAvailable,
    displayedDesktopVersion,
    snapshot.status,
  ]);

  const performUpdate = async (action: UpdateAction) => {
    if (!targetVersion) return;
    setUpdating(action);
    try {
      if (action === 'agent') {
        await updateManagedClio(releaseTag(targetVersion), { restartApp: true });
        return;
      }
      if (action === 'both') {
        await updateManagedClio(releaseTag(targetVersion), { restartApp: false });
      }
      await installDesktopUpdate(() => undefined);
    } catch (error) {
      if (action === 'agent' || action === 'both') {
        await restartClio().catch(() => undefined);
      }
      setUpdating(undefined);
      toast.error('Update failed', {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const recheck = async (): Promise<void> => {
    await Promise.allSettled([checkForDesktopUpdate(), capabilities.refetch()]);
  };

  const updateAll = (): void => {
    if (desktopUpdateAvailable && agentUpdateAvailable) {
      void performUpdate('both');
    } else if (desktopUpdateAvailable) {
      void performUpdate('desktop');
    } else if (agentUpdateAvailable) {
      void performUpdate('agent');
    } else {
      void recheck();
    }
  };

  const statusLabel = {
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
          label={vocab.agent}
          onRecheck={() => void recheck()}
          onUpdate={agentUpdateAvailable ? () => void performUpdate('agent') : undefined}
          releaseUrl={
            brand.agentReleaseUrl && agentVersion
              ? `${brand.agentReleaseUrl}/tag/${releaseTag(agentVersion)}`
              : undefined
          }
          state={capabilities.isError ? 'error' : agentUpdateAvailable ? 'available' : 'current'}
          targetVersion={agentUpdateAvailable ? targetVersion : undefined}
          updating={updating === 'agent'}
        />
        <VersionRow
          currentVersion={displayedDesktopVersion}
          label={vocab.product}
          onRecheck={() => void recheck()}
          onUpdate={desktopUpdateAvailable ? () => void performUpdate('desktop') : undefined}
          releaseUrl={
            brand.desktopReleaseUrl && displayedDesktopVersion
              ? `${brand.desktopReleaseUrl}/tag/${releaseTag(displayedDesktopVersion)}`
              : undefined
          }
          state={
            desktopUpdateAvailable ? 'available' : snapshot.status === 'error' ? 'error' : 'current'
          }
          targetVersion={desktopUpdateAvailable ? targetVersion : undefined}
          updating={updating === 'desktop'}
        />
      </PopoverContent>
    </Popover>
  );
}

function VersionRow({
  currentVersion,
  label,
  onRecheck,
  onUpdate,
  releaseUrl,
  state,
  targetVersion,
  updating,
}: {
  currentVersion?: string;
  label: string;
  onRecheck: () => void;
  onUpdate?: () => void;
  releaseUrl?: string;
  state: Exclude<VersionState, 'checking'>;
  targetVersion?: string;
  updating: boolean;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-3 [&:not(:last-child)]:border-b">
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
      <VersionAction
        disabled={updating}
        label={onUpdate ? 'Update' : state === 'error' ? 'Recheck' : 'Up to date'}
        onClick={onUpdate ?? onRecheck}
        state={state}
        updating={updating}
      />
      <p className="font-mono text-xs text-muted-foreground">
        {currentVersion ? `v${currentVersion}` : 'Unavailable'}
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
  return (
    <CircleAlertIcon
      aria-hidden="true"
      className={cn('size-4', state === 'available' ? 'text-warning' : 'text-destructive')}
    />
  );
}
