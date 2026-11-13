import {
  ActivityIcon,
  CableIcon,
  LanguagesIcon,
  MonitorIcon,
  MoonIcon,
  NetworkIcon,
  SunIcon,
  TerminalSquareIcon,
} from 'lucide-react';
import type { ThemePreference } from '@/theme/contract';
import { englishLanguageName, localLanguageName } from '@/i18n/language-names';
import {
  availableLanguages,
  interfaceLanguage,
  systemLocale,
  type LocalePreference,
} from '@/i18n/locales';
import { OPEN_TERMINAL_EVENT } from '@/components/clio/workspace-canvas-visibility-context';
import { SettingsIcon } from '@/lib/icon-vocabulary';
import {
  INFRASTRUCTURE_SECTIONS,
  settingsDestinations,
  type ApplicationDestination,
} from './application-destinations';
import {
  settingsRowHash,
  settingsSearchRows,
  type SettingsSearchValue,
} from './settings-search-rows';
import { ph, t } from '@lingui/core/macro';

export interface GlobalSearchCommand extends Omit<ApplicationDestination, 'group'> {
  group: 'Navigation' | 'Settings' | 'Infrastructure' | 'Actions';
  action:
    | { route: string }
    | { theme: ThemePreference }
    | { locale: LocalePreference }
    | { event: string };
  /** The language the label is written in, when it is not the interface's (`Español`). */
  lang?: string;
  /** A catalog shortcut that does the same from anywhere. */
  shortcut?: string;
  /** Where the row lives, as muted trailing text: "Settings › App". */
  trail?: string;
  /** One setting rather than a page: it shows only when typed, with its current value. */
  setting?: { value?: SettingsSearchValue };
}

/** Match all typed terms across names, categories and aliases without a remote request. */
export function matchesGlobalSearch(query: string, ...fields: (string | undefined)[]): boolean {
  const text = fields.filter(Boolean).join(' ').toLocaleLowerCase();
  return query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/u)
    .filter(Boolean)
    .every((term) => text.includes(term));
}

/** Application commands reuse the same destinations as their owning pages. */
/** The settings groups (`ApplicationDestination.group` ids) as a trail names them. */
const SETTINGS_GROUP_LABELS: Record<string, string> = {
  App: t`App`,
  Workspace: t`Workspace`,
  Agent: t`Agent`,
};

export function globalSearchCommands(desktop: boolean): GlobalSearchCommand[] {
  const sections = settingsDestinations(desktop);
  const settingRows = settingsSearchRows().flatMap((row): GlobalSearchCommand[] => {
    const section = sections.find((item) => item.id === row.section);
    if (!section) return [];
    return [
      {
        id: `setting:${row.section}:${row.label}`,
        label: row.label,
        icon: section.icon,
        group: 'Settings',
        trail: t`Settings › ${ph({ section: section.label })}`,
        keywords: `${section.label} ${row.keywords ?? ''}`,
        action: { route: `/settings/${row.section}${settingsRowHash(row.label)}` },
        setting: { value: row.value },
      },
    ];
  });
  return [
    {
      id: 'connections',
      label: t`Connections`,
      icon: CableIcon,
      group: 'Navigation',
      keywords: 'connect service computer host',
      action: { route: '/?intent=connect' },
    },
    {
      id: 'runs',
      label: t`Runs`,
      icon: ActivityIcon,
      group: 'Navigation',
      keywords: 'tasks jobs work background',
      action: { route: '/runs' },
    },
    {
      id: 'infrastructure',
      label: t`Infrastructure`,
      icon: NetworkIcon,
      group: 'Navigation',
      keywords: 'hosts servers services setup sandbox protected execution',
      action: { route: '/infrastructure' },
    },
    {
      id: 'settings',
      label: t`Settings`,
      icon: SettingsIcon,
      group: 'Navigation',
      keywords: 'preferences configuration',
      action: { route: '/settings/general' },
      shortcut: 'settings',
    },
    ...settingRows,
    ...sections.map(
      (item): GlobalSearchCommand => ({
        ...item,
        id: `settings:${item.id}`,
        group: 'Settings',
        trail: item.group
          ? t`Settings › ${ph({ group: SETTINGS_GROUP_LABELS[item.group] ?? item.group })}`
          : t`Settings`,
        keywords: `${item.group ?? ''} ${item.keywords ?? ''}`,
        action: { route: `/settings/${item.id}` },
      }),
    ),
    ...INFRASTRUCTURE_SECTIONS.map(
      (item): GlobalSearchCommand => ({
        ...item,
        id: `infrastructure:${item.id}`,
        group: 'Infrastructure',
        keywords: `${item.description} ${item.id === 'agent' ? 'sandbox protected execution health readiness' : ''}`,
        action: { route: `/infrastructure/${item.id}` },
      }),
    ),
    {
      id: 'terminal',
      label: t`Open terminal`,
      icon: TerminalSquareIcon,
      group: 'Actions',
      keywords: 'terminal shell console command line pty workbench',
      action: { event: OPEN_TERMINAL_EVENT },
      shortcut: 'terminal',
    },
    {
      id: 'theme:light',
      label: t`Switch to light mode`,
      icon: SunIcon,
      group: 'Actions',
      keywords: 'theme appearance color day bright notebook paper',
      action: { theme: 'light' },
    },
    {
      id: 'theme:dark',
      label: t`Switch to dark mode`,
      icon: MoonIcon,
      group: 'Actions',
      keywords: 'theme appearance color night notebook ink',
      action: { theme: 'dark' },
    },
    {
      id: 'theme:system',
      label: t`Use system theme`,
      icon: MonitorIcon,
      group: 'Actions',
      keywords: 'appearance automatic light dark mode follow device',
      action: { theme: 'system' },
    },
    ...languageCommands(),
  ];
}

function deviceLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

/**
 * One row per interface language, as in Settings › Language: named in its own
 * language so a reader of none of the others still finds it, and matched by
 * its name in the current and in English too.
 */
function languageCommands(): GlobalSearchCommand[] {
  // i18n-ignore: search aliases in every interface language, so any reader finds the rows; not copy.
  const terms = 'language locale translation idioma 言語 γλώσσα';
  const systemName = interfaceLanguage(systemLocale(deviceLanguages())).nativeName;
  return [
    {
      id: 'language:system',
      label: t`Use system language`,
      icon: LanguagesIcon,
      group: 'Actions',
      trail: systemName,
      keywords: [t`Language`, terms, 'system automatic device follow'].join(' '),
      action: { locale: 'system' },
    },
    ...availableLanguages().map((language): GlobalSearchCommand => {
      const local = localLanguageName(language.locale);
      return {
        id: `language:${language.locale}`,
        label: language.nativeName,
        lang: language.locale === 'pseudo' ? undefined : language.locale,
        icon: LanguagesIcon,
        group: 'Actions',
        trail: local,
        keywords: [
          t`Language`,
          terms,
          local,
          englishLanguageName(language.locale),
          language.locale,
        ]
          .filter(Boolean)
          .join(' '),
        action: { locale: language.locale },
      };
    }),
  ];
}

/** An agent result opens its definition without changing the active conversation. */
export function agentSearchTarget(id: string): string {
  return `agent-${encodeURIComponent(id)}`;
}
