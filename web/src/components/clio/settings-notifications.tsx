import { BellIcon, Volume2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { SettingsChoice, SettingsRow } from '@/components/clio/settings-row';
import { SettingsSectionHeading } from '@/components/clio/settings-section-heading';
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
  type AttentionSoundMode,
  type FinishedWorkMode,
  useNotificationPreferences,
} from '@/providers/notification-preferences-provider';

const SELECT_TRIGGER =
  'w-[150px] px-[9px] text-[0.78125rem] data-[size=default]:h-[1.875rem] data-[size=default]:rounded-md';

/** Sound, desktop alerts, finished work and where the bell's settings icon leads. */
export function NotificationSettings() {
  const {
    attentionSound,
    desktopNotifications,
    finishedWork,
    setAttentionSound,
    setDesktopNotifications,
    setFinishedWork,
  } = useNotificationPreferences();
  const supported = typeof Notification !== 'undefined';
  const blocked = supported && Notification.permission === 'denied';

  // Both desktop choices need the browser's permission before they are kept.
  const allowDesktopAlerts = async () => {
    if (!supported) {
      toast.error('Desktop notifications are not available in this browser');
      return false;
    }
    const permission =
      Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission;
    if (permission !== 'granted') {
      toast.error('Desktop notifications were not enabled', {
        description: 'Allow notifications for this app in your browser or operating system.',
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

  return (
    <div>
      <SettingsSectionHeading
        title="Notifications"
        info={`How ${vocab.agent} alerts you when a session needs your approval or answer. The sidebar attention marker stays visible with sound and alerts off.`}
      />
      <SettingsRow title="Sound">
        <SettingsChoice
          id="attention-sound"
          label="Sound"
          value={attentionSound}
          onChange={(value) => setAttentionSound(value as AttentionSoundMode)}
          options={[
            {
              value: 'background',
              label: 'In background',
              description: 'Sound only while this app is not focused.',
            },
            { value: 'always', label: 'Always', description: 'Sound even while you are here.' },
            { value: 'off', label: 'Off', description: 'No sound.' },
          ]}
        />
        <IconButton
          icon={<Volume2Icon />}
          label="Play test sound"
          onClick={() => {
            void playAttentionSound().then((played) => {
              if (!played) toast.error('This browser could not play the attention sound');
            });
          }}
        />
      </SettingsRow>
      <SettingsRow
        title="Desktop alerts"
        htmlFor="desktop-attention-notifications"
        info="When to show a system notice while the app is in the background. Your browser may ask for permission."
        note={
          !supported
            ? 'Not available in this browser'
            : blocked
              ? 'Blocked in browser settings'
              : undefined
        }
      >
        <Select
          disabled={!supported}
          value={desktopNotifications ? 'needs-you' : 'off'}
          onValueChange={(value) => void updateDesktopNotifications(value === 'needs-you')}
        >
          <SelectTrigger className={SELECT_TRIGGER} id="desktop-attention-notifications">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="needs-you">Needs you</SelectItem>
            <SelectItem value="off">Off</SelectItem>
          </SelectContent>
        </Select>
      </SettingsRow>
      <SettingsRow
        title="Finished work"
        htmlFor="finished-work-notifications"
        info="Where a finished or stopped run tells you. Desktop alert also shows a system notice while the app is in the background."
      >
        <Select
          value={finishedWork}
          onValueChange={(value) => void updateFinishedWork(value as FinishedWorkMode)}
        >
          <SelectTrigger className={SELECT_TRIGGER} id="finished-work-notifications">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="bell">Bell only</SelectItem>
            <SelectItem disabled={!supported} value="desktop">
              Desktop alert
            </SelectItem>
            <SelectItem value="off">Off</SelectItem>
          </SelectContent>
        </Select>
      </SettingsRow>
      <p
        className="flex h-[1.875rem] min-w-0 items-center gap-2 text-xs whitespace-nowrap text-faint"
        data-slot="settings-footnote"
      >
        <BellIcon aria-hidden="true" className="size-[0.8125rem] shrink-0" />
        <span className="flex min-w-0 items-center gap-1 truncate">
          {'The bell\u2019s'}
          <SettingsIcon
            aria-label="Notification settings"
            role="img"
            className="size-[0.8125rem] shrink-0"
          />
          opens this page.
        </span>
      </p>
    </div>
  );
}
