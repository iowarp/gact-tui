import {
  AppWindowIcon,
  CheckCircle2Icon,
  DownloadIcon,
  TriangleAlertIcon,
  XCircleIcon,
} from 'lucide-react';
import { RefreshIcon } from '@/lib/icon-vocabulary';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { formatBytes } from '@/lib/format';
import { vocab } from '@/lib/brand-vocabulary';
import { inTauri } from '@/lib/transport/tauri-runtime';
import {
  checkForDesktopUpdate,
  describeUpdateError,
  DESKTOP_UPDATE_TOAST_ID,
  installDesktopUpdate,
  type DesktopUpdateInfo,
  type DesktopUpdateProgress,
} from '@/tauri/desktop-updater';
import { SettingsSectionHeading } from './settings-section-heading';

type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'current' }
  | { kind: 'available'; update: DesktopUpdateInfo }
  | { kind: 'installing'; update: DesktopUpdateInfo; progress: DesktopUpdateProgress }
  | { kind: 'error'; message: string };

export function DesktopSettings() {
  const desktop = inTauri();
  const [updateState, setUpdateState] = useState<UpdateState>({ kind: 'idle' });

  const checkUpdate = async () => {
    setUpdateState({ kind: 'checking' });
    try {
      const update = await checkForDesktopUpdate();
      if (update) {
        setUpdateState({ kind: 'available', update });
      } else {
        // A manual check that finds the build current outranks a possibly
        // stale background toast (an earlier "available" reported a version
        // the person may have already installed some other way) — clear it.
        toast.dismiss(DESKTOP_UPDATE_TOAST_ID);
        setUpdateState({ kind: 'current' });
      }
    } catch (error) {
      setUpdateState({ kind: 'error', message: describeUpdateError(error) });
    }
  };

  const installUpdate = async (update: DesktopUpdateInfo) => {
    setUpdateState({
      kind: 'installing',
      update,
      progress: { downloadedBytes: 0, finished: false },
    });
    try {
      await installDesktopUpdate((progress) =>
        setUpdateState({ kind: 'installing', update, progress }),
      );
    } catch (error) {
      setUpdateState({ kind: 'error', message: describeUpdateError(error) });
    }
  };

  return (
    <div className="grid gap-6">
      <SettingsSectionHeading
        description={`Manage operating-system features available in ${vocab.product}.`}
        title="Desktop"
      />
      <Frame spacing="lg">
        <FrameHeader>
          <FrameTitle>Desktop integration</FrameTitle>
          <FrameDescription>
            Native lifecycle and credential features are available only in {vocab.product}.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="grid gap-4">
          {[
            { label: 'Native REST and live-stream transport', implemented: true },
            { label: 'SSH tunnel engine', implemented: true },
            { label: 'Menus and system tray', implemented: true },
            { label: 'Secure credential storage', implemented: true },
            { label: 'Sleep and wake reconnect', implemented: true },
          ].map(({ label, implemented }) => {
            const available = desktop && implemented;
            return (
              <div className="flex items-center justify-between gap-3" key={label}>
                <span className="flex items-center gap-2 text-sm">
                  <AppWindowIcon aria-hidden="true" className="size-4 text-primary" />
                  {label}
                </span>
                <DesktopCapabilityStatus
                  detail={
                    implemented
                      ? 'Available when this workspace runs inside the installed app.'
                      : 'This capability is not implemented in the current desktop build.'
                  }
                  state={available ? 'available' : implemented ? 'desktop-only' : 'unavailable'}
                />
              </div>
            );
          })}
        </FramePanel>
        {!desktop ? (
          <FrameFooter className="items-start">
            <p className="text-sm text-muted-foreground">
              Open {vocab.product} to use native integrations.
            </p>
          </FrameFooter>
        ) : null}
      </Frame>
      <Frame spacing="lg">
        <FrameHeader>
          <FrameTitle>App updates</FrameTitle>
          <FrameDescription>
            Updates come from the signed release feed configured for {vocab.product}.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="grid gap-4">
          {!desktop ? (
            <Alert>
              <AppWindowIcon aria-hidden="true" />
              <AlertTitle>Installed app only</AlertTitle>
              <AlertDescription>
                Browser sessions do not download or install desktop releases.
              </AlertDescription>
            </Alert>
          ) : updateState.kind === 'available' || updateState.kind === 'installing' ? (
            <UpdateAvailable state={updateState} />
          ) : updateState.kind === 'current' ? (
            <Alert>
              <CheckCircle2Icon aria-hidden="true" />
              <AlertTitle>This app is up to date</AlertTitle>
              <AlertDescription>No newer signed release is available.</AlertDescription>
            </Alert>
          ) : updateState.kind === 'error' ? (
            <Alert variant="destructive">
              <TriangleAlertIcon aria-hidden="true" />
              <AlertTitle>Update check unavailable</AlertTitle>
              <AlertDescription>{updateState.message}</AlertDescription>
            </Alert>
          ) : (
            <p className="text-sm text-muted-foreground">
              Check when you want to compare this installed build with the signed release feed.
            </p>
          )}
        </FramePanel>
        <FrameFooter className="items-start">
          {updateState.kind === 'available' ? (
            <Button onClick={() => void installUpdate(updateState.update)}>
              <DownloadIcon aria-hidden="true" /> Install and restart
            </Button>
          ) : (
            <Button
              disabled={
                !desktop || updateState.kind === 'checking' || updateState.kind === 'installing'
              }
              onClick={() => void checkUpdate()}
              variant="outline"
            >
              <RefreshIcon
                aria-hidden="true"
                className={updateState.kind === 'checking' ? 'animate-spin' : undefined}
              />
              {updateState.kind === 'checking' ? 'Checking for updates…' : 'Check for updates'}
            </Button>
          )}
        </FrameFooter>
      </Frame>
    </div>
  );
}

function DesktopCapabilityStatus({
  detail,
  state,
}: {
  detail: string;
  state: 'available' | 'desktop-only' | 'unavailable';
}) {
  const presentation = {
    available: {
      icon: CheckCircle2Icon,
      label: 'Available',
      className: 'border-success/30 bg-success/10 text-success',
    },
    'desktop-only': {
      icon: AppWindowIcon,
      label: 'Installed app only',
      className: 'border-border bg-muted/40 text-muted-foreground',
    },
    unavailable: {
      icon: XCircleIcon,
      label: 'Not available',
      className: 'border-border bg-muted/40 text-muted-foreground',
    },
  }[state];
  const Icon = presentation.icon;
  return (
    <Badge
      className={`gap-1.5 rounded-md px-2 py-1 font-medium ${presentation.className}`}
      title={detail}
      variant="outline"
    >
      <Icon aria-hidden="true" className="size-3.5" />
      <span>{presentation.label}</span>
      <span className="sr-only">, {detail}</span>
    </Badge>
  );
}

function UpdateAvailable({
  state,
}: {
  state: Extract<UpdateState, { kind: 'available' | 'installing' }>;
}) {
  const progress = state.kind === 'installing' ? state.progress : undefined;
  const percent =
    progress?.totalBytes && progress.totalBytes > 0
      ? Math.min(100, Math.round((progress.downloadedBytes / progress.totalBytes) * 100))
      : undefined;
  return (
    <Alert>
      <DownloadIcon aria-hidden="true" />
      <AlertTitle>Version {state.update.version} is available</AlertTitle>
      <AlertDescription className="grid gap-3">
        <p>
          Installed {state.update.currentVersion}
          {state.update.date ? `, released ${formatReleaseDate(state.update.date)}` : ''}
        </p>
        {state.update.body ? <p className="whitespace-pre-line">{state.update.body}</p> : null}
        {progress ? (
          <div className="grid gap-1.5">
            {percent === undefined ? null : (
              <Progress aria-label="Update download" value={percent} />
            )}
            <p aria-live="polite" className="text-xs">
              {progress.finished
                ? 'Download complete, installing…'
                : percent === undefined
                  ? `Downloading update, ${formatBytes(progress.downloadedBytes)} received`
                  : `Downloading update, ${percent}%`}
            </p>
          </div>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function formatReleaseDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}
