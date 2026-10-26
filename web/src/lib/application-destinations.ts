import type { ComponentType, SVGProps } from 'react';
import {
  BellRingIcon,
  BotIcon,
  BoxesIcon,
  BrainCircuitIcon,
  CableIcon,
  CalendarClockIcon,
  CpuIcon,
  DatabaseIcon,
  GaugeIcon,
  HeartPulseIcon,
  HistoryIcon,
  HardDriveIcon,
  LayoutDashboardIcon,
  PaletteIcon,
  PlugZapIcon,
  ScrollTextIcon,
  ServerIcon,
  ShieldCheckIcon,
  WrenchIcon,
} from 'lucide-react';
import { AdjustIcon, InfoIcon, SettingsIcon } from '@/lib/icon-vocabulary';
import { vocab } from '@/lib/brand-vocabulary';

/** Shared names and search terms for application navigation. */
export interface ApplicationDestination {
  id: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  group?: string;
  keywords?: string;
}

const SETTINGS_DESTINATIONS: ApplicationDestination[] = [
  {
    id: 'general',
    label: 'General',
    icon: SettingsIcon,
    group: 'Personal',
    keywords: 'files activity preview preferences',
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: PaletteIcon,
    group: 'Personal',
    keywords: 'theme dark light width motion preview files font text size scale zoom display',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: BellRingIcon,
    group: 'Personal',
    keywords: 'sound attention alerts',
  },
  {
    id: 'connections',
    label: `${vocab.agent} connections`,
    icon: CableIcon,
    group: 'Connections',
    keywords: 'service address endpoint server',
  },
  {
    id: 'providers',
    label: 'Model providers',
    icon: ServerIcon,
    group: 'Connections',
    keywords: 'api keys sign in local model server',
  },
  {
    id: 'models',
    label: 'Models',
    icon: CpuIcon,
    group: 'Connections',
    keywords: 'default reasoning response parameters',
  },
  {
    id: 'usage',
    label: 'Usage',
    icon: GaugeIcon,
    group: 'Connections',
    keywords: 'usage limits quota credit balance tokens cost reset subscription spend',
  },
  {
    id: 'data-sources',
    label: 'Data sources',
    icon: DatabaseIcon,
    group: 'Connections',
    keywords: 'accounts sign in github drive globus obsidian vault sync ssh sftp',
  },
  {
    id: 'relays',
    label: 'Remote tools',
    icon: PlugZapIcon,
    group: 'Connections',
    keywords: 'mcp remote tools relay',
  },
  {
    id: 'session-defaults',
    label: 'New session defaults',
    icon: AdjustIcon,
    group: 'Agent',
    keywords: 'model reasoning agent work mode confirmations',
  },
  {
    id: 'agents',
    label: 'Agents',
    icon: BotIcon,
    group: 'Agent',
    keywords: 'agents saved user agents plugins prompt',
  },
  {
    id: 'fleet',
    label: 'Fleet',
    icon: BotIcon,
    group: 'Agent',
    keywords: 'search judge goals best of n refinement automode permissions model',
  },
  {
    id: 'runtime',
    label: 'Execution & history',
    icon: AdjustIcon,
    group: 'Agent',
    keywords:
      'configuration timeout retries transcript reasoning compaction defaults parallelism concurrency subagents nesting depth unlimited',
  },
  {
    id: 'plugins',
    label: 'Extensions',
    icon: BoxesIcon,
    group: 'Agent',
    keywords: 'plugins packs marketplace install trust update skills tools',
  },
  {
    id: 'tools',
    label: 'MCP tools',
    icon: WrenchIcon,
    group: 'Agent',
    keywords: 'services tools connections',
  },
  {
    id: 'prompts',
    label: 'Prompts & commands',
    icon: ScrollTextIcon,
    group: 'Agent',
    keywords: 'instructions overrides commands',
  },
  {
    id: 'schedules',
    label: 'Scheduled work',
    icon: CalendarClockIcon,
    group: 'Agent',
    keywords: 'recurring automation repeat',
  },
  {
    id: 'permissions',
    label: 'Permissions',
    icon: ShieldCheckIcon,
    group: 'Access & system',
    keywords: 'approvals requests access rules policy',
  },
  {
    id: 'memory',
    label: 'Memory',
    icon: BrainCircuitIcon,
    group: 'Access & system',
    keywords: 'remember facts preferences profile inbox review import export past sessions',
  },
  {
    id: 'system',
    label: 'System',
    icon: HeartPulseIcon,
    group: 'Access & system',
    keywords: 'health storage metrics hooks',
  },
  {
    id: 'about',
    label: 'About',
    icon: InfoIcon,
    group: 'Access & system',
    keywords: 'version updates build',
  },
];
/** Settings and global search use the same host-specific destinations. */
export function settingsDestinations(desktop: boolean): ApplicationDestination[] {
  return desktop
    ? SETTINGS_DESTINATIONS.map((item) =>
        item.id === 'general'
          ? { ...item, keywords: `${item.keywords} app updates beta release channel` }
          : item,
      )
    : SETTINGS_DESTINATIONS;
}

export type InfrastructureSection =
  | 'overview'
  | 'agent'
  | 'tools'
  | 'services'
  | 'models'
  | 'activity';

export const INFRASTRUCTURE_SECTIONS = [
  {
    id: 'overview',
    label: 'Overview',
    icon: LayoutDashboardIcon,
    description: 'See how your agent, computers, and services fit together.',
  },
  {
    id: 'agent',
    label: `${vocab.agent} hosts`,
    icon: BotIcon,
    description: `Confirm that ${vocab.agent} itself and the components it depends on are ready.`,
  },
  {
    id: 'services',
    label: 'Services',
    icon: CableIcon,
    description: `Manage inference, web research, and remote execution on the host you choose.`,
  },
  {
    id: 'models',
    label: 'Models & storage',
    icon: HardDriveIcon,
    description: 'Find and download models, inspect their capabilities, and manage storage.',
  },
  {
    id: 'tools',
    label: 'Tools',
    icon: WrenchIcon,
    description: 'Browse the agent’s tool catalog or inspect the tools recorded for this session.',
  },
  {
    id: 'activity',
    label: 'Activity',
    icon: HistoryIcon,
    description: 'Follow deployments, downloads, and lifecycle operations.',
  },
] as const;

/** Accept only infrastructure sections registered in the shared navigation. */
export function isInfrastructureSection(value: string | undefined): value is InfrastructureSection {
  return INFRASTRUCTURE_SECTIONS.some((item) => item.id === value);
}
