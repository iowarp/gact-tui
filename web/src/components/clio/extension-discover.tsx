import type { McpRegistryPage } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { BoxIcon, GlobeIcon, LayersIcon, PlugIcon, SparklesIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { connectionScope } from '@/lib/connection-scope';
import type { ExtensionMetaPart, ExtensionType } from '@/lib/extension-library-entries';
import { useConnectionSettings } from '@/providers/connection-provider';
import type { ExtensionAdd } from './extension-add-dialog';
import { t } from '@lingui/core/macro';

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
  action: { label: string; run: () => void };
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
 * What Discover offers besides the catalog's plugins (listed from the connector catalog
 * by the library, PL-D1): curated starting points, then one page of the public MCP
 * Registry. Home Assistant is a catalog plugin now, not a hard-coded suggestion.
 */
export function useDiscoverItems({
  enabled,
  search,
  cursor,
  onAdd,
  onAddMarketplace,
}: {
  /** Browse the registry: Discover with All or MCP connections in view. */
  enabled: boolean;
  search: string;
  cursor: string;
  onAdd: (choice: ExtensionAdd) => void;
  onAddMarketplace: () => void;
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
  const curated: DiscoverItem[] = [
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
