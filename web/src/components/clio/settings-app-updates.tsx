import { useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { Frame, FrameHeader, FramePanel, FrameTitle } from '@/components/clio/settings-frame';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { setUpdateChannel, useUpdateChannel } from '@/lib/update-channel';
import { isUpdateInFlight, useUpdateFlowStore } from '@/store/update-flow-store';
import { formatBytes } from '@/lib/format';
import { displayReleaseVersion } from '@/lib/release-version';
import {
  checkForDesktopUpdate,
  describeUpdateError,
  DESKTOP_UPDATE_TOAST_ID,
  installDesktopUpdate,
  isDesktopUpdateInstalling,
  getDesktopUpdateSnapshot,
  subscribeDesktopUpdate,
  type DesktopUpdateInfo,
  type DesktopUpdateProgress,
} from '@/tauri/desktop-updater';
import { SettingsRow } from './settings-row';
import { ProductUpdateSummary } from './product-update-summary';
import { desktopCheckIssue } from './version-check-issue';

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
  const snapshot = useSyncExternalStore(
    subscribeDesktopUpdate,
    getDesktopUpdateSnapshot,
    getDesktopUpdateSnapshot,
  );
  const [progress, setProgress] = useState<DesktopUpdateProgress>({
    downloadedBytes: 0,
    finished: false,
  });
  const updateState: UpdateState =
    snapshot.status === 'available'
      ? desktopInstalling
        ? { kind: 'installing', update: snapshot.update, progress }
        : { kind: 'available', update: snapshot.update }
      : snapshot.status === 'error'
        ? { kind: 'error', message: snapshot.message }
        : { kind: snapshot.status === 'unknown' ? 'idle' : snapshot.status };

  const checkUpdate = async () => {
    try {
      const update = await checkForDesktopUpdate();
      if (!update) {
        // A manual check that finds the build current outranks a possibly
        // stale background toast (an earlier "available" reported a version
        // the person may have already installed some other way) — clear it.
        toast.dismiss(DESKTOP_UPDATE_TOAST_ID);
      }
    } catch (error) {
      toast.error(describeUpdateError(error));
    }
  };

  const installUpdate = async () => {
    setProgress({ downloadedBytes: 0, finished: false });
    try {
      await installDesktopUpdate(setProgress);
    } catch (error) {
      toast.error(describeUpdateError(error));
    }
  };

  const available =
    updateState.kind === 'available' || updateState.kind === 'installing'
      ? updateState.update
      : undefined;
  const currentProgress = updateState.kind === 'installing' ? updateState.progress : undefined;
  const percent = currentProgress?.totalBytes
    ? Math.min(
        100,
        Math.round((currentProgress.downloadedBytes / currentProgress.totalBytes) * 100),
      )
    : undefined;
  return (
    <Frame spacing="lg">
      <FrameHeader>
        <FrameTitle>Updates</FrameTitle>
      </FrameHeader>
      <FramePanel className="grid gap-4">
        <ProductUpdateSummary
          state={
            updateState.kind === 'idle'
              ? 'unknown'
              : updateState.kind === 'installing'
                ? 'available'
                : updateState.kind === 'error'
                  ? (desktopCheckIssue(snapshot)?.state ?? 'error')
                  : updateState.kind
          }
          message={
            updateState.kind === 'error'
              ? updateState.message
              : available?.repair
                ? 'Restore the runtime to match the installed app.'
                : undefined
          }
          versions={
            available
              ? [
                  {
                    label: 'Installed',
                    version: displayReleaseVersion(available.currentVersion),
                    targetVersion: displayReleaseVersion(available.version),
                  },
                ]
              : []
          }
          updating={desktopInstalling || updateInFlight}
          disabled={updateInFlight || desktopInstalling}
          onCheck={checkUpdate}
          onUpdate={installUpdate}
        >
          {available?.body ? (
            <p className="whitespace-pre-line text-sm text-muted-foreground">{available.body}</p>
          ) : null}
          {available?.date ? (
            <p className="text-xs text-muted-foreground">
              Released {formatReleaseDate(available.date)}
            </p>
          ) : null}
          {currentProgress ? (
            <div className="grid gap-1.5">
              {percent === undefined ? null : (
                <Progress aria-label="Update download" value={percent} />
              )}
              <p aria-live="polite" className="text-xs text-muted-foreground">
                {currentProgress.finished
                  ? 'Installing update'
                  : percent === undefined
                    ? `${formatBytes(currentProgress.downloadedBytes)} downloaded`
                    : `${percent}% downloaded`}
              </p>
            </div>
          ) : null}
        </ProductUpdateSummary>
        <div className="border-t border-border/60 pt-2">
          <SettingsRow
            title="Beta updates"
            htmlFor="enable-beta-updates"
            note={
              <span id="beta-updates-warning">Include prereleases. Beta versions may be unstable.</span>
            }
          >
            <Switch
              id="enable-beta-updates"
              aria-describedby="beta-updates-warning"
              checked={updateChannel === 'beta'}
              disabled={updateInFlight || desktopInstalling || updateState.kind === 'checking'}
              onCheckedChange={(enabled) => {
                setUpdateChannel(enabled ? 'beta' : 'stable');
                void checkUpdate();
              }}
            />
          </SettingsRow>
        </div>
      </FramePanel>
    </Frame>
  );
}

function formatReleaseDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}
