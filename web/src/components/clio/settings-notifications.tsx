import { Volume2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { SettingsChoice, SettingsRow } from '@/components/clio/settings-row';
import { SettingsSectionHeading as SectionHeading } from '@/components/clio/settings-section-heading';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { playAttentionSound } from '@/lib/attention-sound';
import { vocab } from '@/lib/brand-vocabulary';
import {
  type AttentionSoundMode,
  useNotificationPreferences,
} from '@/providers/notification-preferences-provider';

export function NotificationSettings() {
  const { attentionSound, desktopNotifications, setAttentionSound, setDesktopNotifications } =
    useNotificationPreferences();
  const updateDesktopNotifications = async (enabled: boolean) => {
    if (!enabled) {
      setDesktopNotifications(false);
      return;
    }
    if (typeof Notification === 'undefined') {
      toast.error('Desktop notifications are not available in this browser');
      return;
    }
    const permission =
      Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission;
    if (permission !== 'granted') {
      toast.error('Desktop notifications were not enabled', {
        description: 'Allow notifications for this app in your browser or operating system.',
      });
      return;
    }
    setDesktopNotifications(true);
  };
  return (
    <div className="grid gap-6">
      <SectionHeading
        title="Notifications"
        description={`Choose how ${vocab.agent} alerts you when a session needs your approval or answer.`}
        info="The sidebar attention marker stays visible with sound and notifications turned off."
      />
      <div>
        <SettingsRow
          title="Attention sound"
          description="Play a short chime when a session needs your response."
        >
          <SettingsChoice
            id="attention-sound"
            label="Attention sound"
            value={attentionSound}
            onChange={(value) => setAttentionSound(value as AttentionSoundMode)}
            options={[
              {
                value: 'background',
                label: 'In background',
                description: 'Sound only while this app is not focused.',
              },
              { value: 'always', label: 'Always' },
              { value: 'off', label: 'Off' },
            ]}
          />
        </SettingsRow>
        <SettingsRow title="Test sound" description="Hear the chime used for attention requests.">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void playAttentionSound().then((played) => {
                if (!played) toast.error('This browser could not play the attention sound');
              });
            }}
          >
            <Volume2Icon aria-hidden="true" /> Play test sound
          </Button>
        </SettingsRow>
        <SettingsRow
          title="Desktop notifications"
          htmlFor="desktop-attention-notifications"
          inlineControl
          description="Notify when a session needs a response while the app is in the background. Your browser may ask for permission."
        >
          <Switch
            id="desktop-attention-notifications"
            checked={desktopNotifications}
            onCheckedChange={(enabled) => void updateDesktopNotifications(enabled)}
          />
        </SettingsRow>
      </div>
    </div>
  );
}
