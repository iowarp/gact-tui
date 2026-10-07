import { CheckCircle2Icon, DownloadIcon, TriangleAlertIcon } from 'lucide-react';
import { RefreshButton } from './refresh-button';
import { useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/clio/settings-frame';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { setUpdateChannel, useUpdateChannel } from '@/lib/update-channel';
import { isUpdateInFlight, useUpdateFlowStore } from '@/store/update-flow-store';
import { formatBytes } from '@/lib/format';
import { vocab } from '@/lib/brand-vocabulary';
import {
  checkForDesktopUpdate,
  describeUpdateError,
  DESKTOP_UPDATE_TOAST_ID,
  installDesktopUpdate,
  isDesktopUpdateInstalling,
  subscribeDesktopUpdate,
  type DesktopUpdateInfo,
  type DesktopUpdateProgress,
} from '@/tauri/desktop-updater';
import { SettingsRow } from './settings-row';

type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'current' }
  | { kind: 'available'; update: DesktopUpdateInfo }
  | { kind: 'installing'; update: DesktopUpdateInfo; progress: DesktopUpdateProgress }
  | { kind: 'error'; message: string };

/** Native app update controls, composed into General by the runtime gate. */
export function AppUpdateSettings() {
  const updateChannel = useUpdateChannel();
  const desktopInstalling = useSyncExternalStore(
    subscribeDesktopUpdate,
    isDesktopUpdateInstalling,
    isDesktopUpdateInstalling,
  );
  const updateInFlight = useUpdateFlowStore((state) => isUpdateInFlight(state.step));
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
    <Frame spacing="lg">
      <FrameHeader>
        <FrameTitle>App updates</FrameTitle>
        <FrameDescription>
          Updates come from the signed release feed configured for {vocab.product}.
        </FrameDescription>
      </FrameHeader>
      <FramePanel className="grid gap-4">
        <SettingsRow
          title="Enable beta updates"
          htmlFor="enable-beta-updates"
          description={
            <>
              <p className="text-sm text-muted-foreground" id="beta-updates-warning">
                Beta releases may be unstable. Receive published beta updates for {vocab.product}{' '}
                and {vocab.agent}. Turn this off to receive stable releases only.
              </p>
              <p className="text-xs text-muted-foreground">
                Changing channels never installs an update or downgrades your current version.
              </p>
            </>
          }
        >
          <Switch
            id="enable-beta-updates"
            aria-describedby="beta-updates-warning"
            checked={updateChannel === 'beta'}
            disabled={
              updateInFlight ||
              desktopInstalling ||
              updateState.kind === 'checking' ||
              updateState.kind === 'installing'
            }
            onCheckedChange={(enabled) => {
              setUpdateChannel(enabled ? 'beta' : 'stable');
              setUpdateState({ kind: 'idle' });
              void checkUpdate();
            }}
          />
        </SettingsRow>
        {updateState.kind === 'available' || updateState.kind === 'installing' ? (
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
          <RefreshButton
            label="Check for updates"
            refreshing={updateState.kind === 'checking'}
            disabled={updateState.kind === 'checking' || updateState.kind === 'installing'}
            onRefresh={checkUpdate}
            variant="outline"
          >
            {updateState.kind === 'checking' ? 'Checking for updates…' : 'Check for updates'}
          </RefreshButton>
        )}
      </FrameFooter>
    </Frame>
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
