import { BellIcon, Volume2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { SettingsChoice, SettingsRow } from '@/components/clio/settings-row';
import { SettingsSectionHeading } from '@/components/clio/settings-section-heading';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

const SELECT_TRIGGER =
  'w-[150px] px-[9px] text-menu data-[size=default]:h-[1.875rem] data-[size=default]:rounded-md';

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
          value={desktopNotifications ? 'needs-you' : 'off'}
          onValueChange={(value) => void updateDesktopNotifications(value === 'needs-you')}
        >
          <SelectTrigger className={SELECT_TRIGGER} id="desktop-attention-notifications">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="needs-you">{t`Needs you`}</SelectItem>
            <SelectItem value="off">{t`Off`}</SelectItem>
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
          <SelectTrigger className={SELECT_TRIGGER} id="finished-work-notifications">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="bell">{t`Bell only`}</SelectItem>
            <SelectItem disabled={!supported} value="desktop">
              {t`Desktop alert`}
            </SelectItem>
            <SelectItem value="off">{t`Off`}</SelectItem>
          </SelectContent>
        </Select>
      </SettingsRow>
      <p
        className="flex h-[1.875rem] min-w-0 items-center gap-2 text-xs whitespace-nowrap text-muted-foreground"
        data-slot="settings-footnote"
      >
        <BellIcon aria-hidden="true" className="size-[0.8125rem] shrink-0" />
        <span className="flex min-w-0 items-center gap-1 truncate">
          <Trans>
            The bell’s
            <SettingsIcon
              aria-label={t`Notification settings`}
              role="img"
              className="size-[0.8125rem] shrink-0"
            />
            opens this page.
          </Trans>
        </span>
      </p>
    </div>
  );
}
