import { ActivityIcon, CableIcon, MonitorIcon, MoonIcon, NetworkIcon, SunIcon } from 'lucide-react';
import type { ThemePreference } from '@/theme/contract';
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

export interface GlobalSearchCommand extends Omit<ApplicationDestination, 'group'> {
  group: 'Navigation' | 'Settings' | 'Infrastructure' | 'Actions';
  action: { route: string } | { theme: ThemePreference };
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
        trail: `Settings › ${section.label}`,
        keywords: `${section.label} ${row.keywords ?? ''}`,
        action: { route: `/settings/${row.section}${settingsRowHash(row.label)}` },
        setting: { value: row.value },
      },
    ];
  });
  return [
    {
      id: 'connections',
      label: 'Connections',
      icon: CableIcon,
      group: 'Navigation',
      keywords: 'connect service computer host',
      action: { route: '/?intent=connect' },
    },
    {
      id: 'runs',
      label: 'Runs',
      icon: ActivityIcon,
      group: 'Navigation',
      keywords: 'tasks jobs work background',
      action: { route: '/runs' },
    },
    {
      id: 'infrastructure',
      label: 'Infrastructure',
      icon: NetworkIcon,
      group: 'Navigation',
      keywords: 'hosts servers services setup sandbox protected execution',
      action: { route: '/infrastructure' },
    },
    {
      id: 'settings',
      label: 'Settings',
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
        trail: item.group ? `Settings › ${item.group}` : 'Settings',
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
      id: 'theme:light',
      label: 'Switch to light mode',
      icon: SunIcon,
      group: 'Actions',
      keywords: 'theme appearance color day bright notebook paper',
      action: { theme: 'light' },
    },
    {
      id: 'theme:dark',
      label: 'Switch to dark mode',
      icon: MoonIcon,
      group: 'Actions',
      keywords: 'theme appearance color night notebook ink',
      action: { theme: 'dark' },
    },
    {
      id: 'theme:system',
      label: 'Use system theme',
      icon: MonitorIcon,
      group: 'Actions',
      keywords: 'appearance automatic light dark mode follow device',
      action: { theme: 'system' },
    },
  ];
}

/** An agent result opens its definition without changing the active conversation. */
export function agentSearchTarget(id: string): string {
  return `agent-${encodeURIComponent(id)}`;
}
