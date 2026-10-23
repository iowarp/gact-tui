import {
  ActivityIcon,
  CableIcon,
  MonitorIcon,
  MoonIcon,
  NetworkIcon,
  NotebookPenIcon,
  SunIcon,
} from 'lucide-react';
import type { ThemePreference } from '@/theme/contract';
import { SettingsIcon } from '@/lib/icon-vocabulary';
import {
  INFRASTRUCTURE_SECTIONS,
  settingsDestinations,
  type ApplicationDestination,
} from './application-destinations';

export interface GlobalSearchCommand extends Omit<ApplicationDestination, 'group'> {
  group: 'Navigation' | 'Settings' | 'Infrastructure' | 'Actions';
  action: { route: string } | { theme: ThemePreference };
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
  return [
    {
      id: 'connections',
      label: 'Connections',
      icon: CableIcon,
      group: 'Navigation',
      keywords: 'connect service computer host',
      action: { route: '/' },
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
    },
    ...settingsDestinations(desktop).map(
      (item): GlobalSearchCommand => ({
        ...item,
        id: `settings:${item.id}`,
        group: 'Settings',
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
      keywords: 'theme appearance color day bright',
      action: { theme: 'light' },
    },
    {
      id: 'theme:dark',
      label: 'Switch to dark mode',
      icon: MoonIcon,
      group: 'Actions',
      keywords: 'theme appearance color night',
      action: { theme: 'dark' },
    },
    {
      id: 'theme:notebook',
      label: 'Switch to Notebook theme',
      icon: NotebookPenIcon,
      group: 'Actions',
      keywords: 'theme appearance color paper ink notebook warm',
      action: { theme: 'notebook' },
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
