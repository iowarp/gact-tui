import type { ComponentType, SVGProps } from 'react';
import { t } from '@lingui/core/macro';
import { BugIcon, MonitorCogIcon, MoonIcon, MoonStarIcon, SunDimIcon, SunIcon } from 'lucide-react';
import { SettingsChoice, SettingsRow } from '@/components/clio/settings-row';
import { SettingsSectionHeading as SectionHeading } from '@/components/clio/settings-section-heading';
import { LanguageSetting } from '@/components/clio/settings-language';
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

// Theme names live in theme/contract.ts, which the pre-paint boot script also
// bundles without the translation runtime, so they are translated here.
const THEME_LABELS: Record<ThemeId, string> = {
  light: t`Light`,
  dark: t`Dark`,
  'classic-light': t`Cool`,
  'classic-dark': t`Neutral`,
  debug: t`Debug`,
};

const THEME_DESCRIPTIONS: Partial<Record<ThemeId, string>> = {
  light: t`Paper, ink and verdigris.`,
  dark: t`Warm ink with verdigris accents.`,
  'classic-light': t`The earlier cool, blue-tinted light theme.`,
  'classic-dark': t`The earlier neutral dark theme.`,
  debug: t`Development only: every color is red, so anything else skips the theme.`,
};

const themeOptions = [
  { value: 'system', label: t`System`, icon: MonitorCogIcon },
  ...THEMES.filter((theme) => !theme.development || import.meta.env.DEV).map((theme) => ({
    value: theme.id,
    label: THEME_LABELS[theme.id],
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
        title={t`Appearance`}
        description={t`Choose how ${vocab.agent} looks and presents your conversations.`}
      />
      <div>
        <LanguageSetting />
        <SettingsRow
          title={t`Theme`}
          info={t`Choose a theme, or follow your system setting.`}
          note={
            theme === 'system' || THEMES.find(({ id }) => id === theme)?.scheme === 'system'
              ? resolvedTheme.dark
                ? t`Following your system, now dark`
                : t`Following your system, now light`
              : undefined
          }
        >
          <SettingsChoice
            id="theme"
            label={t`Theme`}
            value={theme}
            onChange={(value) => setTheme(value as ThemePreference)}
            options={themeOptions}
          />
        </SettingsRow>
        <SettingsRow
          title={t`Interface size`}
          info={t`Enlarge text and controls for comfortable reading on this device.`}
        >
          <SettingsChoice
            id="interface-size"
            label={t`Interface size`}
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
          title={t`Conversation width`}
          info={t`Use a focused reading column or give tables and diagrams more room.`}
        >
          <SettingsChoice
            id="conversation-width"
            label={t`Conversation width`}
            value={conversationWidth}
            onChange={(value) => setConversationWidth(value as ConversationWidth)}
            options={[
              { value: 'focused', label: t`Focused` },
              { value: 'wide', label: t`Wide` },
            ]}
          />
        </SettingsRow>
        <SettingsRow
          title={t`Motion`}
          info={t`Follow this device's preference or reduce interface animation.`}
        >
          <SettingsChoice
            id="motion"
            label={t`Motion`}
            value={motion}
            onChange={(value) => setMotion(value as MotionPreference)}
            options={[
              { value: 'system', label: t`Follow system` },
              { value: 'reduced', label: t`Reduce motion` },
            ]}
          />
        </SettingsRow>
      </div>
    </div>
  );
}
