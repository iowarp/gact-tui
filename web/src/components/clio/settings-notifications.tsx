import { BellIcon, Volume2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { SettingsChoice, SettingsRow } from '@/components/clio/settings-row';
import { SettingsSectionHeading } from '@/components/clio/settings-section-heading';
import { Button } from '@/components/ui/button';
import { Select as SelectPrimitive } from 'radix-ui';
import { Select, SelectContent, SelectItem } from '@/components/ui/select';
import { playAttentionSound } from '@/lib/attention-sound';
import { vocab } from '@/lib/brand-vocabulary';
import { SettingsIcon } from '@/lib/icon-vocabulary';
import {
  notificationPermission,
  openNotificationSettings,
  requestNotificationPermission,
  type SystemNotificationPermission,
} from '@/lib/system-notifications';
import { inTauri } from '@/lib/transport/tauri-runtime';
import {
  type AttentionSoundMode,
  type FinishedWorkMode,
  useNotificationPreferences,
} from '@/providers/notification-preferences-provider';
import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { SettingsSelectField } from './model-select-field';

// The spec's 150 px is the floor; a longer translation widens the field up to its column,
// and past that the value wraps inside a taller field rather than being cut.
const SELECT_FIELD = 'h-auto min-h-[1.875rem] w-fit min-w-[9.375rem] max-w-full py-1';

/**
 * The chosen value over zero-height copies of every choice in this section, so both
 * selects take the width of the longest one: aligned, and steady when the value changes.
 * Only the shown value sets the height, and it wraps when the column is narrower.
 */
function NotificationValue({ value, choices }: { value: string; choices: readonly string[] }) {
  return (
    <span className="grid min-w-0 grid-cols-[minmax(0,1fr)]">
      {choices.map((choice) => (
        <span
          aria-hidden="true"
          className="invisible col-start-1 row-start-1 h-0 overflow-hidden whitespace-nowrap"
          key={choice}
        >
          {choice}
        </span>
      ))}
      <span className="col-start-1 row-start-1 whitespace-normal [overflow-wrap:anywhere]">
        {value}
      </span>
    </span>
  );
}

/** Sound, desktop alerts, finished work and where the bell's settings icon leads. */
const { agent } = vocab;

export function NotificationSettings() {
  const {
    attentionSound,
    desktopNotifications,
    finishedWork,
    setAttentionSound,
    setDesktopNotifications,
    setFinishedWork,
  } = useNotificationPreferences();
  const alertLabels = { 'needs-you': t`Needs you`, off: t`Off` } as const;
  const finishedLabels: Record<FinishedWorkMode, string> = {
    bell: t`Bell only`,
    desktop: t`Desktop alert`,
    off: t`Off`,
  };
  const choices = [
    ...new Set([...Object.values(alertLabels), ...Object.values(finishedLabels)]),
  ];
  const alertValue = desktopNotifications ? 'needs-you' : 'off';
  const [permission, setPermission] = useState<SystemNotificationPermission>('default');
  useEffect(() => {
    let current = true;
    const read = () =>
      void notificationPermission().then((value) => {
        if (current) setPermission(value);
      });
    read();
    // The person may change it in the system's settings and come back.
    window.addEventListener('focus', read);
    return () => {
      current = false;
      window.removeEventListener('focus', read);
    };
  }, []);
  const supported = permission !== 'unsupported';
  const blocked = permission === 'denied';

  // Both desktop choices need the system's permission before they are kept.
  const allowDesktopAlerts = async () => {
    if (!supported) {
      toast.error(t`Desktop notifications are not available here`);
      return false;
    }
    const answer = await requestNotificationPermission();
    setPermission(answer);
    if (answer !== 'granted') {
      toast.error(t`Desktop notifications were not enabled`, {
        description: inTauri()
          ? t`Allow notifications for this app in System Settings › Notifications.`
          : t`Allow notifications for this site in your browser settings.`,
      });
      return false;
    }
    return true;
  };
  const updateDesktopNotifications = async (enabled: boolean) => {
    if (!enabled || (await allowDesktopAlerts())) setDesktopNotifications(enabled);
  };
  const updateFinishedWork = async (mode: FinishedWorkMode) => {
    if (mode !== 'desktop' || (await allowDesktopAlerts())) setFinishedWork(mode);
  };
  const permissionNote = !supported
    ? t`Not available here`
    : blocked
      ? inTauri()
        ? t`Turned off in system settings`
        : t`Blocked in browser settings`
      : permission === 'default' && (desktopNotifications || finishedWork === 'desktop')
        ? t`Not allowed yet`
        : undefined;

  return (
    <div>
      <SettingsSectionHeading
        title={t`Notifications`}
        info={t`How ${agent} alerts you when a session needs your approval or answer. The sidebar attention marker stays visible with sound and alerts off.`}
      />
      <SettingsRow title={t`Sound`}>
        <SettingsChoice
          id="attention-sound"
          label={t`Sound`}
          value={attentionSound}
          onChange={(value) => setAttentionSound(value as AttentionSoundMode)}
          options={[
            {
              value: 'background',
              label: t`In background`,
              description: t`Sound only while this app is not focused.`,
            },
            { value: 'always', label: t`Always`, description: t`Sound even while you are here.` },
            { value: 'off', label: t`Off`, description: t`No sound.` },
          ]}
        />
        <IconButton
          icon={<Volume2Icon />}
          label={t`Play test sound`}
          onClick={() => {
            void playAttentionSound().then((played) => {
              if (!played) toast.error(t`This browser could not play the attention sound`);
            });
          }}
        />
      </SettingsRow>
      <SettingsRow
        title={t`Desktop alerts`}
        htmlFor="desktop-attention-notifications"
        info={t`When to show a system notice while the app is in the background. The system asks for permission the first time.`}
        note={permissionNote}
      >
        {permission === 'default' && (desktopNotifications || finishedWork === 'desktop') ? (
          <Button onClick={() => void allowDesktopAlerts()} size="sm" variant="outline">
            {t`Allow`}
          </Button>
        ) : null}
        {blocked && inTauri() ? (
          <Button onClick={() => void openNotificationSettings()} size="sm" variant="outline">
            {t`Open System Settings`}
          </Button>
        ) : null}
        <Select
          disabled={!supported}
          value={alertValue}
          onValueChange={(value) => void updateDesktopNotifications(value === 'needs-you')}
        >
          <SelectPrimitive.Trigger asChild>
            <SettingsSelectField
              className={SELECT_FIELD}
              id="desktop-attention-notifications"
              title={alertLabels[alertValue]}
              value={<NotificationValue choices={choices} value={alertLabels[alertValue]} />}
            />
          </SelectPrimitive.Trigger>
          <SelectContent align="end">
            <SelectItem value="needs-you">{alertLabels['needs-you']}</SelectItem>
            <SelectItem value="off">{alertLabels.off}</SelectItem>
          </SelectContent>
        </Select>
      </SettingsRow>
      <SettingsRow
        title={t`Finished work`}
        htmlFor="finished-work-notifications"
        info={t`Where a finished or stopped run tells you. Desktop alert also shows a system notice while the app is in the background.`}
      >
        <Select
          value={finishedWork}
          onValueChange={(value) => void updateFinishedWork(value as FinishedWorkMode)}
        >
          <SelectPrimitive.Trigger asChild>
            <SettingsSelectField
              className={SELECT_FIELD}
              id="finished-work-notifications"
              title={finishedLabels[finishedWork]}
              value={<NotificationValue choices={choices} value={finishedLabels[finishedWork]} />}
            />
          </SelectPrimitive.Trigger>
          <SelectContent align="end">
            <SelectItem value="bell">{finishedLabels.bell}</SelectItem>
            <SelectItem disabled={!supported} value="desktop">
              {finishedLabels.desktop}
            </SelectItem>
            <SelectItem value="off">{finishedLabels.off}</SelectItem>
          </SelectContent>
        </Select>
      </SettingsRow>
      <p
        className="flex min-h-[1.875rem] min-w-0 items-start gap-2 py-[0.4375rem] text-xs text-muted-foreground"
        data-slot="settings-footnote"
      >
        <BellIcon aria-hidden="true" className="mt-px size-[0.8125rem] shrink-0" />
        {/* Inline text, so a longer translation wraps with the icon in its sentence. */}
        <span className="min-w-0 text-pretty">
          <Trans>
            The bell’s
            <SettingsIcon
              aria-label={t`Notification settings`}
              role="img"
              className="mx-1 inline size-[0.8125rem] align-[-0.125rem]"
            />
            opens this page.
          </Trans>
        </span>
      </p>
    </div>
  );
}
