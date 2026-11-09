import type { ComponentType, SVGProps } from 'react';
import { BugIcon, MonitorCogIcon, MoonIcon, MoonStarIcon, SunDimIcon, SunIcon } from 'lucide-react';
import { SettingsChoice, SettingsRow } from '@/components/clio/settings-row';
import { SettingsSectionHeading as SectionHeading } from '@/components/clio/settings-section-heading';
import { vocab } from '@/lib/brand-vocabulary';
import {
  type ConversationWidth,
  type InterfaceSize,
  type MotionPreference,
  useAppearancePreferences,
  useTheme,
} from '@/providers/appearance-provider';
import { THEMES, type ThemeId, type ThemePreference } from '@/theme/contract';

const THEME_ICONS: Record<ThemeId, ComponentType<SVGProps<SVGSVGElement>>> = {
  light: SunIcon,
  dark: MoonIcon,
  'classic-light': SunDimIcon,
  'classic-dark': MoonStarIcon,
  debug: BugIcon,
};

const THEME_DESCRIPTIONS: Partial<Record<ThemeId, string>> = {
  light: 'Paper, ink and verdigris.',
  dark: 'Warm ink with verdigris accents.',
  'classic-light': 'The earlier cool, blue-tinted light theme.',
  'classic-dark': 'The earlier neutral dark theme.',
  debug: 'Development only: every color is red, so anything else skips the theme.',
};

const themeOptions = [
  { value: 'system', label: 'System', icon: MonitorCogIcon },
  ...THEMES.filter((theme) => !theme.development || import.meta.env.DEV).map((theme) => ({
    value: theme.id,
    label: theme.label,
    description: THEME_DESCRIPTIONS[theme.id],
    icon: THEME_ICONS[theme.id],
  })),
];

export function AppearanceSettings() {
  const { resolvedTheme, theme, setTheme } = useTheme();
  const {
    conversationWidth,
    interfaceSize,
    motion,
    setConversationWidth,
    setInterfaceSize,
    setMotion,
  } = useAppearancePreferences();
  return (
    <div>
      <SectionHeading
        title="Appearance"
        description={`Choose how ${vocab.agent} looks and presents your conversations.`}
      />
      <div>
        <SettingsRow
          title="Theme"
          info="Choose a theme, or follow your system setting."
          note={
            theme === 'system' || THEMES.find(({ id }) => id === theme)?.scheme === 'system'
              ? `Following your system, now ${resolvedTheme.dark ? 'dark' : 'light'}`
              : undefined
          }
        >
          <SettingsChoice
            id="theme"
            label="Theme"
            value={theme}
            onChange={(value) => setTheme(value as ThemePreference)}
            options={themeOptions}
          />
        </SettingsRow>
        <SettingsRow
          title="Interface size"
          info="Enlarge text and controls for comfortable reading on this device."
        >
          <SettingsChoice
            id="interface-size"
            label="Interface size"
            value={String(interfaceSize)}
            onChange={(value) => setInterfaceSize(Number(value) as InterfaceSize)}
            options={[
              { value: '100', label: '100%' },
              { value: '125', label: '125%' },
              { value: '150', label: '150%' },
            ]}
          />
        </SettingsRow>
        <SettingsRow
          title="Conversation width"
          info="Use a focused reading column or give tables and diagrams more room."
        >
          <SettingsChoice
            id="conversation-width"
            label="Conversation width"
            value={conversationWidth}
            onChange={(value) => setConversationWidth(value as ConversationWidth)}
            options={[
              { value: 'focused', label: 'Focused' },
              { value: 'wide', label: 'Wide' },
            ]}
          />
        </SettingsRow>
        <SettingsRow
          title="Motion"
          info="Follow this device's preference or reduce interface animation."
        >
          <SettingsChoice
            id="motion"
            label="Motion"
            value={motion}
            onChange={(value) => setMotion(value as MotionPreference)}
            options={[
              { value: 'system', label: 'Follow system' },
              { value: 'reduced', label: 'Reduce motion' },
            ]}
          />
        </SettingsRow>
      </div>
    </div>
  );
}
