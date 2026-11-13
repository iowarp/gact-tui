import type {
  McpRegistryPage,
  PluginEntry,
  PluginMarketplace,
  SavedMcpService,
} from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { BoxIcon, GlobeIcon, LayersIcon, PlugIcon, SparklesIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { connectionScope } from '@/lib/connection-scope';
import {
  shortSource,
  type ExtensionMetaPart,
  type ExtensionType,
} from '@/lib/extension-library-entries';
import { useConnectionSettings } from '@/providers/connection-provider';
import type { ExtensionAdd } from './extension-add-dialog';
import { t } from '@lingui/core/macro';

const HA_SKILLS = 'https://github.com/homeassistant-ai/skills';
const HA_MCP = 'https://github.com/homeassistant-ai/ha-mcp';

/** A suggestion or MCP Registry server before it is installed. */
export interface DiscoverItem {
  key: string;
  title: string;
  icon: ReactNode;
  meta: ExtensionMetaPart[];
  description: string;
  source?: string;
  detail?: string;
  types: ExtensionType[];
  /** Suggested in Yours while it is not installed. */
  suggested?: boolean;
  installed?: boolean;
  /** `opensOnly` actions only show what is installed, so they work without plugin support. */
  action: { label: string; run: () => void; opensOnly?: boolean };
}

export function registryChoice(server: McpRegistryPage['servers'][number]['server']): ExtensionAdd {
  const title = server.title || server.name.split('/').at(-1);
  if (server.remotes[0]?.url) return { kind: 'remote', url: server.remotes[0].url, title };
  const pkg = server.packages.find(
    (row) => row.registryType === 'pypi' || row.registryType === 'npm',
  );
  if (pkg?.registryType === 'pypi')
    return {
      kind: 'local',
      title,
      command: 'uvx',
      args: [pkg.identifier + (pkg.version ? `==${pkg.version}` : '')],
    };
  if (pkg?.registryType === 'npm')
    return {
      kind: 'local',
      title,
      command: 'npx',
      args: ['-y', pkg.identifier + (pkg.version ? `@${pkg.version}` : '')],
    };
  return { kind: 'local', title };
}

/**
 * What Discover offers: curated starting points that know whether they are
 * installed, then one page of the public MCP Registry.
 */
export function useDiscoverItems({
  enabled,
  search,
  cursor,
  plugins,
  marketplaces,
  services,
  onAdd,
  onAddMarketplace,
  onViewSkill,
}: {
  /** Browse the registry: Discover with All or MCP connections in view. */
  enabled: boolean;
  search: string;
  cursor: string;
  plugins: readonly PluginEntry[];
  marketplaces: readonly PluginMarketplace[];
  services: readonly SavedMcpService[];
  onAdd: (choice: ExtensionAdd) => void;
  onAddMarketplace: () => void;
  onViewSkill: (plugin: PluginEntry, skill: string) => void;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const scope = connectionScope(settings);
  const registry = useQuery({
    queryKey: ['extension-discovery', scope, search, cursor],
    queryFn: ({ signal }) => repository.discoverMcp(search, cursor, signal),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
  const haSource = marketplaces.find((row) => shortSource(row.source) === shortSource(HA_SKILLS));
  const haSkill = plugins.find(
    (row) => row.marketplace === haSource?.name && row.id === 'home-assistant-skills',
  );
  const haConnected = services.some((row) =>
    /home.?assistant/iu.test(`${row.name} ${row.label ?? ''}`),
  );
  const curated: DiscoverItem[] = [
    {
      key: 'home-assistant-skills',
      title: t`Home Assistant skills`,
      icon: <LayersIcon />,
      meta: [
        { text: t`Plugin` },
        { text: t`Agent Skills` },
        { text: shortSource(HA_SKILLS), mono: true },
      ],
      description: t`Best practices, dashboards, automations and reference files from homeassistant-ai.`,
      source: HA_SKILLS,
      types: ['all', 'plugins', 'skills'],
      suggested: true,
      installed: Boolean(haSkill),
      action: haSkill
        ? {
            label: t`View`,
            opensOnly: true,
            run: () => onViewSkill(haSkill, 'home-assistant-best-practices'),
          }
        : {
            label: t`Install`,
            run: () => onAdd({ kind: 'import', category: 'skills', source: HA_SKILLS }),
          },
    },
    {
      key: 'home-assistant-mcp',
      title: t`Home Assistant MCP`,
      icon: <GlobeIcon />,
      meta: [{ text: t`MCP connection` }, { text: shortSource(HA_MCP), mono: true }],
      description: t`Connect your Home Assistant deployment, or run the ha-mcp package on the agent host.`,
      source: HA_MCP,
      types: ['all', 'mcp'],
      suggested: true,
      installed: haConnected,
      // i18n-ignore: product name for the new connection
      action: { label: t`Install`, run: () => onAdd({ kind: 'remote', title: 'Home Assistant' }) },
    },
    {
      key: 'own-plugin',
      title: t`Bring your own plugin`,
      icon: <LayersIcon />,
      meta: [{ text: t`Plugin` }, { text: t`Repository, folder or ZIP` }],
      description: t`Import Agent Plugins or Claude Code plugins, or compose your own capabilities.`,
      types: ['all', 'plugins'],
      action: { label: t`Add`, run: () => onAdd({ kind: 'import', category: 'plugins' }) },
    },
    {
      key: 'own-skills',
      title: t`Bring your own skills`,
      icon: <SparklesIcon />,
      meta: [{ text: t`Skills` }, { text: t`Repository, folder or ZIP` }],
      description: t`Import a repository of Agent Skills, or upload one skill folder as a ZIP.`,
      types: ['all', 'skills'],
      action: { label: t`Add`, run: () => onAdd({ kind: 'import', category: 'skills' }) },
    },
    {
      key: 'own-marketplace',
      title: t`Add a marketplace`,
      icon: <BoxIcon />,
      meta: [{ text: t`Marketplace` }, { text: t`Git repository or host folder` }],
      description: t`A marketplace lists plugins in the Agent Plugins or Claude Code format. Its plugins load after you trust it.`,
      types: ['all', 'marketplaces'],
      action: { label: t`Add`, run: onAddMarketplace },
    },
  ];
  const registryItems: DiscoverItem[] = (registry.data?.servers ?? []).map(({ server }) => {
    const choice = registryChoice(server);
    const packages = server.packages.map((row) => `${row.registryType}: ${row.identifier}`);
    return {
      key: `registry:${server.name}:${server.version}`,
      title: server.title || server.name,
      icon: server.remotes.length ? <GlobeIcon /> : <PlugIcon />,
      meta: [
        { text: t`MCP connection` },
        server.remotes.length
          ? { text: t`remote service` }
          : { text: packages[0] ?? t`See server documentation`, mono: Boolean(packages[0]) },
      ],
      description: server.description,
      source: server.repository?.url,
      detail: server.remotes.length
        ? t`Remote connection`
        : packages.join(', ') || t`See server documentation`,
      types: ['all', 'mcp'],
      action: { label: t`Install`, run: () => onAdd(choice) },
    };
  });
  return { curated, registry, registryItems };
}
