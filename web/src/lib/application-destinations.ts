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
  FolderIcon,
  GaugeIcon,
  GlobeIcon,
  HardDriveIcon,
  HeartPulseIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  PaletteIcon,
  PlugIcon,
  PlugZapIcon,
  ScrollTextIcon,
  SearchIcon,
  ServerIcon,
  ShieldCheckIcon,
  UserRoundIcon,
  WrenchIcon,
} from 'lucide-react';
import { AdjustIcon, InfoIcon, SettingsIcon } from '@/lib/icon-vocabulary';
import { vocab } from '@/lib/brand-vocabulary';
import { t } from '@lingui/core/macro';

/** Shared names and search terms for application navigation. */
export interface ApplicationDestination {
  id: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  group?: string;
  keywords?: string;
  /** A folded settings page: listed by search, shown inside its host page. */
  host?: string;
}

const { agent } = vocab;

const SETTINGS_DESTINATIONS: ApplicationDestination[] = [
  {
    id: 'general',
    label: t`General`,
    icon: SettingsIcon,
    group: 'App',
    keywords: 'files activity preview preferences personal',
  },
  {
    id: 'appearance',
    label: t`Appearance`,
    icon: PaletteIcon,
    group: 'App',
    keywords: 'theme dark light width motion preview files font text size scale zoom display',
  },
  {
    id: 'profile',
    label: t`Profile`,
    icon: UserRoundIcon,
    group: 'App',
    keywords: 'name email about you personal',
  },
  {
    id: 'notifications',
    label: t`Notifications`,
    icon: BellRingIcon,
    group: 'App',
    keywords: 'sound attention alerts',
  },
  {
    id: 'about',
    label: t`About`,
    icon: InfoIcon,
    group: 'App',
    keywords: 'version updates build',
  },
  {
    id: 'folders',
    label: t`Folders`,
    icon: FolderIcon,
    group: 'Workspace',
    keywords: 'workspace primary additional folders colour icon sandbox access',
  },
  {
    id: 'memory',
    label: t`Memory and instructions`,
    icon: BrainCircuitIcon,
    group: 'Workspace',
    keywords: 'remember facts preferences profile inbox review import export past sessions',
  },
  {
    id: 'connections',
    label: t`Connection`,
    icon: CableIcon,
    group: 'Agent',
    // i18n-ignore: search keywords, kept in English like every other destination's keywords
    keywords: `${vocab.agent} connections service address endpoint server`,
  },
  {
    id: 'models',
    label: t`Models`,
    icon: CpuIcon,
    group: 'Agent',
    keywords: 'default reasoning response parameters',
  },
  {
    id: 'fleet',
    label: t`Helper models`,
    icon: BotIcon,
    group: 'Agent',
    host: 'models',
    keywords:
      'fleet search judge goals best of n refinement automode permissions fast model delegation delegate accounts',
  },
  {
    id: 'providers',
    label: t`Providers`,
    icon: ServerIcon,
    group: 'Agent',
    keywords: 'model providers api keys sign in local model server',
  },
  {
    id: 'usage',
    label: t`Usage`,
    icon: GaugeIcon,
    group: 'Agent',
    keywords: 'usage limits quota credit balance tokens cost reset subscription spend',
  },
  {
    id: 'session-defaults',
    label: t`Session defaults`,
    icon: AdjustIcon,
    group: 'Agent',
    keywords: 'new session defaults model reasoning agent work mode confirmations',
  },
  {
    id: 'agents',
    label: t`Agents`,
    icon: BotIcon,
    group: 'Agent',
    keywords: 'agents saved user agents plugins prompt',
  },
  {
    id: 'plugins',
    label: t`Extensions and connectors`,
    icon: BoxesIcon,
    group: 'Agent',
    keywords:
      'connectors connector apps views services plugins packs marketplace install trust update skills tools',
  },
  {
    id: 'tools',
    label: t`Tools and MCP servers`,
    icon: WrenchIcon,
    group: 'Agent',
    keywords: 'mcp tools services connections',
  },
  {
    id: 'relays',
    label: t`Remote tools`,
    icon: PlugZapIcon,
    group: 'Agent',
    host: 'tools',
    keywords: 'mcp remote tools relay',
  },
  {
    id: 'tool-permissions',
    label: t`Tool permissions`,
    icon: WrenchIcon,
    group: 'Agent',
    host: 'tools',
    keywords: 'tool permission approval io direct code both always allow blocked needs approval',
  },
  {
    id: 'permissions',
    label: t`Permissions`,
    icon: ShieldCheckIcon,
    group: 'Agent',
    keywords: 'approvals requests access rules policy',
  },
  {
    id: 'prompts',
    label: t`Prompts & commands`,
    icon: ScrollTextIcon,
    group: 'Agent',
    keywords: 'instructions overrides commands',
  },
  {
    id: 'schedules',
    label: t`Scheduled work`,
    icon: CalendarClockIcon,
    group: 'Agent',
    keywords: 'recurring automation repeat',
  },
  {
    id: 'runtime',
    label: t`Execution & history`,
    icon: AdjustIcon,
    group: 'Agent',
    keywords:
      'configuration timeout retries transcript reasoning compaction defaults parallelism concurrency subagents nesting depth unlimited',
  },
  {
    id: 'browser',
    label: t`Browser`,
    icon: GlobeIcon,
    group: 'Agent',
    host: 'runtime',
    keywords: 'browser chrome edge chromium installed remote debugging sign-ins web pages',
  },
  {
    id: 'web-search',
    label: t`Web search`,
    icon: SearchIcon,
    group: 'Agent',
    keywords:
      'search web literature papers datasets sources keys api exa keenable firecrawl you parallel openalex crossref arxiv semantic scholar',
  },
  {
    id: 'data-sources',
    label: t`Data sources`,
    icon: DatabaseIcon,
    group: 'Agent',
    keywords: 'accounts sign in github drive globus obsidian vault sync ssh sftp',
  },
  {
    id: 'system',
    label: t`Health`,
    icon: HeartPulseIcon,
    group: 'Agent',
    keywords: 'system health storage metrics hooks',
  },
];
/** Settings and global search use the same host-specific destinations. */
export function settingsDestinations(desktop: boolean): ApplicationDestination[] {
  return desktop
    ? SETTINGS_DESTINATIONS.map((item) =>
        item.id === 'general'
          ? {
              ...item,
              // i18n-ignore: search keywords, kept in English like every other destination's keywords
              keywords: `${item.keywords} app updates beta release channel`,
            }
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
    label: t`Overview`,
    icon: LayoutDashboardIcon,
    description: t`See how your agent, computers, and services fit together.`,
  },
  {
    id: 'agent',
    label: t`${agent} hosts`,
    icon: BotIcon,
    description: t`Confirm that ${agent} itself and the components it depends on are ready.`,
  },
  {
    id: 'services',
    label: t`Services`,
    icon: PlugIcon,
    description: t`Manage inference, web research, and remote execution on the host you choose.`,
  },
  {
    id: 'models',
    label: t`Models & storage`,
    icon: HardDriveIcon,
    description: t`Find and download models, inspect their capabilities, and manage storage.`,
  },
  {
    id: 'tools',
    label: t`Tools`,
    icon: WrenchIcon,
    description: t`Browse the agent’s tool catalog or inspect the tools recorded for this session.`,
  },
  {
    id: 'activity',
    label: t`Activity`,
    icon: HistoryIcon,
    description: t`Follow deployments, downloads, and lifecycle operations.`,
  },
] as const;

/** Accept only infrastructure sections registered in the shared navigation. */
export function isInfrastructureSection(value: string | undefined): value is InfrastructureSection {
  return INFRASTRUCTURE_SECTIONS.some((item) => item.id === value);
}
