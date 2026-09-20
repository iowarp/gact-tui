import { useQuery } from '@tanstack/react-query';
import { brand } from '@brand';
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  MonitorIcon,
  PackageIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { Frame, FramePanel } from '@/components/reui/frame';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SidebarMenuButton } from '@/components/ui/sidebar';
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
import { openExternalUrl } from '@/tauri/external-url';
import { restartClio, updateManagedClio } from '@/tauri/managed-backend';

type VersionState = 'checking' | 'current' | 'available' | 'error';
type UpdateAction = 'desktop' | 'agent' | 'both';

export function NavigationVersionStatus() {
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

  const statusLabel = {
    checking: 'Checking versions',
    current: `${vocab.product} and ${vocab.agent} are up to date`,
    available: 'Software update available',
    error: 'Version status needs attention',
  }[state];

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) void checkForDesktopUpdate().catch(() => undefined);
      }}
    >
      <PopoverTrigger asChild>
        <SidebarMenuButton
          aria-label={statusLabel}
          className="w-auto shrink-0 px-2"
          tooltip={statusLabel}
        >
          <VersionStateIcon state={state} />
          <span className="font-mono text-xs">
            {displayedDesktopVersion ? `v${displayedDesktopVersion}` : 'Version'}
          </span>
        </SidebarMenuButton>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80" side="right">
        <VersionCard
          currentVersion={displayedDesktopVersion}
          icon={MonitorIcon}
          label={vocab.product}
          onOpenRelease={
            brand.desktopReleaseUrl && displayedDesktopVersion
              ? () =>
                  void openExternalUrl(
                    `${brand.desktopReleaseUrl}/tag/${releaseTag(displayedDesktopVersion)}`,
                  )
              : undefined
          }
          onUpdate={
            desktopUpdateAvailable && !agentUpdateAvailable
              ? () => void performUpdate('desktop')
              : undefined
          }
          state={
            desktopUpdateAvailable ? 'available' : snapshot.status === 'error' ? 'error' : 'current'
          }
          targetVersion={desktopUpdateAvailable ? targetVersion : undefined}
          updating={updating === 'desktop'}
        />
        <VersionCard
          currentVersion={agentVersion}
          icon={PackageIcon}
          label={vocab.agent}
          onOpenRelease={
            brand.agentReleaseUrl && agentVersion
              ? () =>
                  void openExternalUrl(`${brand.agentReleaseUrl}/tag/${releaseTag(agentVersion)}`)
              : undefined
          }
          onUpdate={
            agentUpdateAvailable && !desktopUpdateAvailable
              ? () => void performUpdate('agent')
              : undefined
          }
          state={capabilities.isError ? 'error' : agentUpdateAvailable ? 'available' : 'current'}
          targetVersion={agentUpdateAvailable ? targetVersion : undefined}
          updating={updating === 'agent'}
        />
        {desktopUpdateAvailable && agentUpdateAvailable ? (
          <div className="grid grid-cols-3 gap-2">
            <Button
              disabled={Boolean(updating)}
              onClick={() => void performUpdate('desktop')}
              size="sm"
              variant="outline"
            >
              Desktop
            </Button>
            <Button
              disabled={Boolean(updating)}
              onClick={() => void performUpdate('agent')}
              size="sm"
              variant="outline"
            >
              {vocab.agent}
            </Button>
            <Button
              disabled={Boolean(updating)}
              onClick={() => void performUpdate('both')}
              size="sm"
            >
              {updating === 'both' ? <LoaderCircleIcon className="animate-spin" /> : null}
              Both
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function VersionCard({
  currentVersion,
  icon: Icon,
  label,
  onOpenRelease,
  onUpdate,
  state,
  targetVersion,
  updating,
}: {
  currentVersion?: string;
  icon: typeof MonitorIcon;
  label: string;
  onOpenRelease?: () => void;
  onUpdate?: () => void;
  state: Exclude<VersionState, 'checking'>;
  targetVersion?: string;
  updating: boolean;
}) {
  return (
    <Frame spacing="sm">
      <FramePanel className="flex items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
          <Icon aria-hidden="true" className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 font-medium">
            <span className="truncate">{label}</span>
            <VersionStateIcon state={state} />
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            {currentVersion ? `v${currentVersion}` : 'Unavailable'}
            {targetVersion ? ` → v${targetVersion}` : ''}
          </p>
        </div>
        {onOpenRelease ? (
          <Button
            aria-label={`Open ${label} release`}
            onClick={onOpenRelease}
            size="icon-xs"
            variant="ghost"
          >
            <ExternalLinkIcon aria-hidden="true" />
          </Button>
        ) : null}
        {onUpdate ? (
          <Button disabled={updating} onClick={onUpdate} size="sm">
            {updating ? <LoaderCircleIcon className="animate-spin" /> : null}
            Update
          </Button>
        ) : null}
      </FramePanel>
    </Frame>
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
