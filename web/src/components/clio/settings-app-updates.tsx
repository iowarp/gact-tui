import { SETTINGS_COLUMN } from '@/lib/settings-fold';
import { cn } from '@/lib/utils';
import { useState, useSyncExternalStore } from 'react';
import { DownloadIcon, LoaderCircleIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { vocab } from '@/lib/brand-vocabulary';
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
  type DesktopUpdateProgress,
} from '@/tauri/desktop-updater';
import { StatusIndicator, type StatusTone } from './primitives/status-indicator';
import { RefreshButton } from './refresh-button';
import { SettingsGroupLabel, SettingsRow } from './settings-row';
import { desktopCheckIssue, versionCheckIssueDetail } from './version-check-issue';

type UpdateKind = 'unknown' | 'checking' | 'current' | 'available' | 'unavailable' | 'error';

const STATUS: Record<UpdateKind, { label: string; tone: StatusTone }> = {
  unknown: { label: 'Not checked', tone: 'idle' },
  checking: { label: 'Checking', tone: 'running' },
  current: { label: 'Up to date', tone: 'success' },
  available: { label: 'Update available', tone: 'info' },
  unavailable: { label: 'Could not check', tone: 'warning' },
  error: { label: 'Needs attention', tone: 'error' },
};

/** Native app update rows, composed into General by the runtime gate. */
export function AppUpdateSettings() {
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

  const available = snapshot.status === 'available' ? snapshot.update : undefined;
  const kind: UpdateKind =
    snapshot.status === 'error'
      ? (desktopCheckIssue(snapshot)?.state ?? 'error')
      : snapshot.status === 'available'
        ? 'available'
        : snapshot.status === 'checking' || snapshot.status === 'current'
          ? snapshot.status
          : 'unknown';
  const updating = desktopInstalling || updateInFlight;
  const status = updating ? { label: 'Updating', tone: 'running' as const } : STATUS[kind];
  const issueText = desktopCheckIssue(snapshot)?.text;
  const detail = issueText !== undefined ? versionCheckIssueDetail(issueText) : undefined;
  const versions = available
    ? `v${displayReleaseVersion(available.currentVersion)} → v${displayReleaseVersion(available.version)}`
    : undefined;
  const currentProgress = available && desktopInstalling ? progress : undefined;
  const percent = currentProgress?.totalBytes
    ? Math.min(
        100,
        Math.round((currentProgress.downloadedBytes / currentProgress.totalBytes) * 100),
      )
    : undefined;

  return (
    <>
      <SettingsGroupLabel>Updates</SettingsGroupLabel>
      <SettingsRow
        error={detail ? <span title={detail}>{detail}</span> : undefined}
        note={available?.repair ? 'Restore the runtime to match the installed app.' : undefined}
        title={`${vocab.agent} app`}
      >
        <span aria-label="Update status" className="inline-flex min-w-0" role="status">
          <StatusIndicator
            className="text-xs text-muted-foreground"
            label={status.label}
            tone={status.tone}
          />
        </span>
        {versions ? (
          <span
            className="min-w-0 truncate font-mono text-xs font-semibold tabular-nums"
            title={versions}
          >
            {versions}
          </span>
        ) : null}
        {kind === 'available' || updating ? (
          <Button
            className="shrink-0"
            disabled={updating}
            onClick={() => void installUpdate()}
            size="sm"
          >
            {updating ? (
              <LoaderCircleIcon aria-hidden="true" className="motion-safe:animate-spin" />
            ) : (
              <DownloadIcon aria-hidden="true" />
            )}
            {updating ? 'Updating' : `Update ${vocab.agent}`}
          </Button>
        ) : (
          <RefreshButton
            className="shrink-0"
            disabled={updateInFlight || desktopInstalling}
            label="Check for updates"
            onRefresh={checkUpdate}
            refreshing={kind === 'checking'}
            size="sm"
            variant="outline"
          />
        )}
      </SettingsRow>
      {available?.body || available?.date ? (
        <div
          className={cn('@container w-full', SETTINGS_COLUMN)}
          data-slot="settings-release-notes"
        >
          <div className="grid gap-1 border-b border-border/70 py-2.5">
            <div className="flex min-w-0 items-center gap-2 text-[0.8125rem] whitespace-nowrap">
              <h3 className="truncate font-normal">Release notes</h3>
              {available.date ? (
                <span className="ml-auto shrink-0 text-xs text-faint">
                  Released {formatReleaseDate(available.date)}
                </span>
              ) : null}
            </div>
            {available.body ? (
              <p className="line-clamp-6 text-xs leading-[1.5] whitespace-pre-line text-muted-foreground">
                {available.body}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      {currentProgress ? (
        <SettingsRow title="Download">
          {percent === undefined ? null : (
            <Progress aria-label="Update download" className="w-28 shrink-0" value={percent} />
          )}
          <span aria-live="polite" className="text-xs text-muted-foreground tabular-nums">
            {currentProgress.finished
              ? 'Installing update'
              : percent === undefined
                ? `${formatBytes(currentProgress.downloadedBytes)} downloaded`
                : `${percent}% downloaded`}
          </span>
        </SettingsRow>
      ) : null}
      <BetaUpdatesRow
        disabled={updateInFlight || desktopInstalling || kind === 'checking'}
        onChange={() => void checkUpdate()}
      />
    </>
  );
}

/** The release channel for app and agent update checks; the web app has no other place to set it. */
export function BetaUpdatesRow({
  disabled,
  onChange,
}: {
  disabled?: boolean;
  onChange?: () => void;
}) {
  const updateChannel = useUpdateChannel();
  return (
    <SettingsRow
      htmlFor="enable-beta-updates"
      inlineControl
      note={
        <span id="beta-updates-warning">Include prereleases. Beta versions may be unstable.</span>
      }
      title="Beta updates"
    >
      <Switch
        aria-describedby="beta-updates-warning"
        checked={updateChannel === 'beta'}
        disabled={disabled}
        id="enable-beta-updates"
        onCheckedChange={(enabled) => {
          setUpdateChannel(enabled ? 'beta' : 'stable');
          onChange?.();
        }}
      />
    </SettingsRow>
  );
}

function formatReleaseDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}
