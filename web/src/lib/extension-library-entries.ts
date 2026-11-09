/**
 * The rows of Settings > Extensions: installed plugins, marketplaces, your
 * skills and your MCP connections, as one list with one vocabulary for what
 * each row is, where it comes from and what state it is in.
 */
import type {
  McpServerDefinition,
  PluginEntry,
  PluginMarketplace,
  SavedMcpService,
} from '@clio/core/v3';
import { toast } from 'sonner';
import type { StatusTone } from '@/components/clio/primitives/status-indicator';
import { copyText } from '@/lib/clipboard';
import { serviceEntryTitle, serviceKind, serviceStatus } from '@/lib/mcp-service-presentation';
import { catalogMatches, catalogRoots } from '@/lib/plugin-catalog-tree';

export type ExtensionType = 'all' | 'plugins' | 'marketplaces' | 'mcp' | 'skills';

/** The type tabs, in order. */
export const EXTENSION_TYPE_LABELS: Record<ExtensionType, string> = {
  all: 'All',
  plugins: 'Plugins',
  marketplaces: 'Marketplaces',
  mcp: 'MCP connections',
  skills: 'Skills',
};

export const LOCAL_MARKETPLACE = 'private-local';

export interface ExtensionMetaPart {
  text: string;
  /** A source address or command, set in the monospace face. */
  mono?: boolean;
}

export interface ExtensionStatus {
  tone: StatusTone;
  label: string;
}

interface EntryBase {
  key: string;
  title: string;
  meta: ExtensionMetaPart[];
  status?: ExtensionStatus;
}

export type ExtensionEntry =
  | (EntryBase & { kind: 'plugin'; plugin: PluginEntry })
  | (EntryBase & { kind: 'skill'; plugin: PluginEntry; skill: string })
  | (EntryBase & {
      kind: 'marketplace';
      marketplace: PluginMarketplace;
      /** Installed plugins whose update waits for the trust step. */
      pendingUpdates: number;
    })
  | (EntryBase & {
      kind: 'mcp';
      name: string;
      saved?: SavedMcpService;
      server?: McpServerDefinition;
      remote: boolean;
    });

export const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/** Where a plugin comes from, in the words of the list: your library reads "Yours". */
export function sourceName(marketplace: string): string {
  return marketplace === LOCAL_MARKETPLACE ? 'Yours' : marketplace;
}

/** A local plugin that is one skill of the same name reads as that skill. */
export function isStandaloneSkill(plugin: PluginEntry): boolean {
  return (
    plugin.marketplace === LOCAL_MARKETPLACE &&
    plugin.kind !== 'pack' &&
    plugin.skills.length === 1 &&
    plugin.skills[0] === plugin.id &&
    !plugin.mcp_servers.length &&
    !plugin.subagents.length &&
    !plugin.hooks.length &&
    !plugin.commands.length
  );
}

/** The two largest things a plugin brings, so the meta line stays one short line. */
export function pluginContents(plugin: PluginEntry): string {
  if (plugin.kind === 'pack') return plural(plugin.members.length, 'plugin');
  const parts = (
    [
      [plugin.skills.length, 'skill'],
      [plugin.mcp_servers.length, 'server'],
      [plugin.tools.length, 'tool'],
      [plugin.commands.length, 'command'],
      [plugin.subagents.length, 'subagent'],
      [plugin.flows.length, 'flow'],
      [plugin.hooks.length, 'hook'],
      [plugin.fragments.length, 'prompt fragment'],
    ] as const
  )
    .filter(([count]) => count > 0)
    .slice(0, 2)
    .map(([count, word]) => plural(count, word));
  return parts.join(', ') || 'Nothing of its own';
}

export function formatName(format: string): string {
  return format === 'claude-code' ? 'Claude Code format' : 'Agent Plugins format';
}

function problems(diagnostics: readonly { severity: string }[]): number {
  return diagnostics.filter((row) => row.severity === 'error').length;
}

export function pluginStatus(plugin: PluginEntry): ExtensionStatus {
  if (plugin.pending_trust) return { tone: 'warning', label: 'Update waits for trust' };
  if (!plugin.trusted) return { tone: 'warning', label: 'Not trusted' };
  const errors = problems(plugin.diagnostics);
  if (errors) return { tone: 'error', label: plural(errors, 'problem') };
  return { tone: 'success', label: 'Trusted' };
}

export function pluginRow(plugin: PluginEntry): ExtensionEntry {
  return {
    kind: 'plugin',
    key: `plugin:${plugin.ref}:${plugin.pending_trust}`,
    title: plugin.id,
    plugin,
    meta: [
      { text: plugin.kind === 'pack' ? 'Pack' : 'Plugin' },
      { text: pluginContents(plugin) },
      { text: sourceName(plugin.marketplace) },
    ],
    status: pluginStatus(plugin),
  };
}

export function skillRow(plugin: PluginEntry, skill: string): ExtensionEntry {
  const own = isStandaloneSkill(plugin);
  const status = pluginStatus(plugin);
  return {
    kind: 'skill',
    key: `skill:${plugin.ref}:${skill}`,
    title: skill,
    plugin,
    skill,
    meta: own
      ? [{ text: 'Skill' }, { text: 'Yours' }]
      : [{ text: 'Skill' }, { text: plugin.id }, { text: sourceName(plugin.marketplace) }],
    // A skill says nothing while its plugin is fine; trust and problems still show.
    status: status.tone === 'success' ? undefined : status,
  };
}

/** A short, readable source: no scheme, no `.git`. Local folders stay as they are. */
export function shortSource(source: string): string {
  return source
    .replace(/^(?:git\+)?https?:\/\//u, '')
    .replace(/^git@([^:]+):/u, '$1/')
    .replace(/\.git\/?$/u, '')
    .replace(/\/$/u, '');
}

export function marketplaceShipped(marketplace: PluginMarketplace): boolean {
  return (
    marketplace.default ||
    marketplace.trust_reason === 'shipped' ||
    marketplace.trust_reason === 'default_marketplace'
  );
}

export function marketplaceTitle(marketplace: Pick<PluginMarketplace, 'name'>): string {
  return marketplace.name === LOCAL_MARKETPLACE ? 'Private local marketplace' : marketplace.name;
}

export function marketplaceRow(
  marketplace: PluginMarketplace,
  plugins: readonly PluginEntry[],
): ExtensionEntry {
  const pendingUpdates = plugins.filter(
    (plugin) => plugin.pending_trust && plugin.marketplace === marketplace.name,
  ).length;
  const errors = problems(marketplace.diagnostics);
  const status: ExtensionStatus = !marketplace.trusted
    ? { tone: 'warning', label: 'Not trusted' }
    : pendingUpdates
      ? {
          tone: 'warning',
          label: `${pendingUpdates === 1 ? '1 update waits' : `${pendingUpdates} updates wait`} for trust`,
        }
      : errors
        ? { tone: 'error', label: plural(errors, 'problem') }
        : { tone: 'success', label: 'Trusted' };
  const meta: ExtensionMetaPart[] = [{ text: 'Marketplace' }];
  // Your library is a collection, not a source: its format and folder stay in its details.
  if (marketplace.name === LOCAL_MARKETPLACE) meta.push({ text: 'On this host' });
  else {
    meta.push({ text: formatName(marketplace.format) });
    meta.push(
      marketplaceShipped(marketplace)
        ? { text: 'Shipped' }
        : { text: shortSource(marketplace.source), mono: true },
    );
  }
  if (marketplace.parent) meta.push({ text: `Via ${marketplace.parent}` });
  if (errors && status.tone !== 'error') meta.push({ text: plural(errors, 'problem') });
  return {
    kind: 'marketplace',
    key: `marketplace:${marketplace.name}`,
    title: marketplaceTitle(marketplace),
    marketplace,
    pendingUpdates,
    meta,
    status,
  };
}

/** Your MCP connections: every saved service, joined with what the listing reports. */
export function mcpRows(
  saved: readonly SavedMcpService[],
  servers: readonly McpServerDefinition[],
): ExtensionEntry[] {
  const yours = servers.filter((server) => server.source === 'user');
  const rows: ExtensionEntry[] = saved.map((service) => {
    const server = yours.find((row) => row.name === service.name);
    return mcpRow(service.name, service, server);
  });
  for (const server of yours)
    if (!saved.some((service) => service.name === server.name))
      rows.push(mcpRow(server.name, undefined, server));
  return rows;
}

function mcpRow(
  name: string,
  saved: SavedMcpService | undefined,
  server: McpServerDefinition | undefined,
): ExtensionEntry {
  const remote = serviceKind({ saved, server }) === 'remote';
  return {
    kind: 'mcp',
    key: `mcp:${name}`,
    title: serviceEntryTitle({ name, saved, server }),
    name,
    saved,
    server,
    remote,
    meta: [
      { text: 'MCP connection' },
      { text: remote ? 'remote service' : 'local command' },
      // The count is only known once the server has listed its tools.
      ...(server?.status === 'ready' && server.tools_count
        ? [{ text: plural(server.tools_count, 'tool') }]
        : []),
    ],
    status: serviceStatus(server),
  };
}

/** Rows that come from sources you added sort before the ones shipped with the service. */
function shippedLast<T>(rows: readonly T[], shipped: (row: T) => boolean): T[] {
  return [...rows.filter((row) => !shipped(row)), ...rows.filter(shipped)];
}

export function entryText(entry: ExtensionEntry): string {
  const extra =
    entry.kind === 'plugin' || entry.kind === 'skill'
      ? [entry.plugin.description, entry.plugin.ref]
      : entry.kind === 'marketplace'
        ? [entry.marketplace.name, entry.marketplace.source]
        : [entry.name];
  return [entry.title, ...entry.meta.map((part) => part.text), ...extra]
    .join(' ')
    .toLocaleLowerCase();
}

/** Every row of one type, in list order, matching the search. */
export function extensionEntries({
  type,
  plugins,
  marketplaces,
  saved,
  servers,
  term = '',
}: {
  type: ExtensionType;
  plugins: readonly PluginEntry[];
  marketplaces: readonly PluginMarketplace[];
  saved: readonly SavedMcpService[];
  servers: readonly McpServerDefinition[];
  term?: string;
}): ExtensionEntry[] {
  const query = term.trim().toLocaleLowerCase();
  const shipped = new Set(marketplaces.filter(marketplaceShipped).map((row) => row.name));
  const rows: ExtensionEntry[] = [];
  if (type === 'all' || type === 'plugins') {
    const roots = shippedLast(
      catalogRoots(plugins).filter((plugin) => !isStandaloneSkill(plugin)),
      (plugin) => shipped.has(plugin.marketplace),
    );
    rows.push(
      ...roots
        .filter((plugin) => catalogMatches(plugins, plugin, query))
        .map((plugin) => pluginRow(plugin)),
    );
  }
  if (type === 'all' || type === 'marketplaces') {
    const listed = shippedLast(marketplaces, marketplaceShipped).map((row) =>
      marketplaceRow(row, plugins),
    );
    rows.push(...listed.filter((row) => !query || entryText(row).includes(query)));
  }
  if (type === 'all' || type === 'skills') {
    const sources = type === 'all' ? plugins.filter(isStandaloneSkill) : plugins;
    const skills = shippedLast(sources, (plugin) => shipped.has(plugin.marketplace)).flatMap(
      (plugin) => plugin.skills.map((skill) => skillRow(plugin, skill)),
    );
    rows.push(...skills.filter((row) => !query || entryText(row).includes(query)));
  }
  if (type === 'all' || type === 'mcp')
    rows.push(...mcpRows(saved, servers).filter((row) => !query || entryText(row).includes(query)));
  return rows;
}

export function copyReference(reference: string) {
  void copyText(reference).then(
    () => toast.success('Reference copied', { description: reference }),
    (error: unknown) =>
      toast.error('Could not copy the reference', {
        description: error instanceof Error ? error.message : reference,
      }),
  );
}

/**
 * What a skill or command file says it does: its front matter `description:`,
 * else its first line of prose after the headings.
 */
export function markdownSummary(text: string | undefined): string {
  if (!text) return '';
  const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
  const line = front?.[1]?.match(/^description:\s*(.+)$/mu)?.[1]?.trim();
  if (line) return line.replace(/^(['"])(.*)\1$/u, '$2');
  const body = front ? text.slice(front[0].length) : text;
  return (
    body
      .split(/\r?\n/u)
      .map((row) => row.trim())
      .find((row) => row && !row.startsWith('#') && !row.startsWith('```')) ?? ''
  );
}

export function copyAddress(address: string) {
  void copyText(address).then(
    () => toast.success('Copied', { description: address }),
    (error: unknown) =>
      toast.error('Could not copy', {
        description: error instanceof Error ? error.message : address,
      }),
  );
}
