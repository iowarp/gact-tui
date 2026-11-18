import {
  ActivityIcon,
  BarChart3Icon,
  BoxIcon,
  CalendarIcon,
  ChartLineIcon,
  CloudIcon,
  CpuIcon,
  DatabaseIcon,
  FlaskConicalIcon,
  FolderIcon,
  GaugeIcon,
  GlobeIcon,
  HardDriveIcon,
  KeyRoundIcon,
  LayersIcon,
  LayoutDashboardIcon,
  ListIcon,
  MapIcon,
  MicroscopeIcon,
  NetworkIcon,
  PlugIcon,
  RocketIcon,
  ServerIcon,
  ShieldIcon,
  TableIcon,
  TelescopeIcon,
  TerminalIcon,
  WorkflowIcon,
  type LucideIcon,
} from 'lucide-react';
import { createElement } from 'react';
import { SettingsIcon } from '@/lib/icon-vocabulary';

/**
 * The Lucide names a plugin tab may wear. A curated set rather than every
 * Lucide icon: the full set would ship all of them. A name outside it shows
 * the generic plugin icon (HS3: an unknown icon renders a generic one).
 */
const PLUGIN_TAB_ICONS = new Map<string, LucideIcon>([
  ['activity', ActivityIcon],
  ['bar-chart', BarChart3Icon],
  ['bar-chart-3', BarChart3Icon],
  ['box', BoxIcon],
  ['calendar', CalendarIcon],
  ['chart-line', ChartLineIcon],
  ['line-chart', ChartLineIcon],
  ['cloud', CloudIcon],
  ['cpu', CpuIcon],
  ['database', DatabaseIcon],
  ['flask-conical', FlaskConicalIcon],
  ['folder', FolderIcon],
  ['gauge', GaugeIcon],
  ['globe', GlobeIcon],
  ['hard-drive', HardDriveIcon],
  ['key-round', KeyRoundIcon],
  ['layers', LayersIcon],
  ['layout-dashboard', LayoutDashboardIcon],
  ['list', ListIcon],
  ['map', MapIcon],
  ['microscope', MicroscopeIcon],
  ['network', NetworkIcon],
  ['plug', PlugIcon],
  ['rocket', RocketIcon],
  ['server', ServerIcon],
  ['settings', SettingsIcon],
  ['shield', ShieldIcon],
  ['table', TableIcon],
  ['telescope', TelescopeIcon],
  ['terminal', TerminalIcon],
  ['workflow', WorkflowIcon],
]);

/** `ServerIcon`, `server` and `Server` all name the same icon. */
function normalized(name: string): string {
  return name
    .trim()
    .replace(/Icon$/u, '')
    .replace(/([a-z0-9])([A-Z])/gu, '$1-$2')
    .replace(/[\s_]+/gu, '-')
    .toLowerCase();
}

export function pluginTabIcon(name: string | undefined): LucideIcon {
  return (name && PLUGIN_TAB_ICONS.get(normalized(name))) || PlugIcon;
}

/** A plugin tab's icon, by the name its plugin gave. */
export function PluginTabIcon({ name, className }: { name: string; className?: string }) {
  return createElement(pluginTabIcon(name), { 'aria-hidden': true, className });
}
