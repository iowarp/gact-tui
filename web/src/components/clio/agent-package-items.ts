import type { AgentResolution } from '@clio/core/v3';
import {
  BotIcon,
  ScrollTextIcon,
  ServerIcon,
  SparklesIcon,
  TerminalIcon,
  WebhookIcon,
  WorkflowIcon,
  WrenchIcon,
  type LucideIcon,
} from 'lucide-react';
import { promptSectionLabel } from '@/lib/plugin-presentation';

/** One kind of thing a package brings to an agent. */
export type PackageCategory =
  | 'tools'
  | 'mcp'
  | 'subagents'
  | 'skills'
  | 'prompts'
  | 'commands'
  | 'flows'
  | 'hooks';

export interface PackageCategoryInfo {
  value: PackageCategory;
  /** The filter's label. */
  label: string;
  singular: string;
  plural: string;
}

/** The filter's order; a category shows only when some package brings it. */
export const PACKAGE_CATEGORIES: readonly PackageCategoryInfo[] = [
  { value: 'tools', label: 'Tools', singular: 'tool', plural: 'tools' },
  { value: 'subagents', label: 'Subagents', singular: 'subagent', plural: 'subagents' },
  { value: 'skills', label: 'Skills', singular: 'skill', plural: 'skills' },
  { value: 'prompts', label: 'Prompts', singular: 'prompt part', plural: 'prompt parts' },
  { value: 'mcp', label: 'MCP', singular: 'MCP server', plural: 'MCP servers' },
  { value: 'commands', label: 'Commands', singular: 'command', plural: 'commands' },
  { value: 'flows', label: 'Flows', singular: 'flow', plural: 'flows' },
  { value: 'hooks', label: 'Hooks', singular: 'hook', plural: 'hooks' },
];

export const PACKAGE_CATEGORY: Record<PackageCategory, PackageCategoryInfo> = Object.fromEntries(
  PACKAGE_CATEGORIES.map((info) => [info.value, info]),
) as Record<PackageCategory, PackageCategoryInfo>;

export const CATEGORY_ICONS: Record<PackageCategory, LucideIcon> = {
  tools: WrenchIcon,
  mcp: ServerIcon,
  subagents: BotIcon,
  skills: SparklesIcon,
  prompts: ScrollTextIcon,
  commands: TerminalIcon,
  flows: WorkflowIcon,
  hooks: WebhookIcon,
};
/** One thing a package brings, as its own row and detail. */
export interface PackageItem {
  id: string;
  category: PackageCategory;
  /** The package (plugin) that brings it. */
  plugin: string;
  description: string;
  /** A short qualifier: a tool loaded when needed, a prompt part's section. */
  note?: string;
  /** A prompt part's text. */
  text?: string;
}

export type PackageItems = Record<PackageCategory, PackageItem[]>;

const DEFERRED_NOTE = 'Loaded when needed';

/** Everything the resolution attributes to `pluginId`, by category. */
export function packageItems(resolution: AgentResolution, pluginId: string): PackageItems {
  const own = <T extends { plugin?: string | null }>(rows: readonly T[]) =>
    rows.filter((row) => row.plugin === pluginId);
  const described = (
    category: PackageCategory,
    rows: readonly { id: string; description?: string }[],
  ): PackageItem[] =>
    rows.map((row) => ({
      id: row.id,
      category,
      plugin: pluginId,
      description: row.description ?? '',
    }));
  return {
    tools: own(resolution.tools).map((tool) => ({
      id: tool.name,
      category: 'tools',
      plugin: pluginId,
      description: tool.description ?? '',
      note: tool.defer === true ? DEFERRED_NOTE : undefined,
    })),
    mcp: Object.entries(resolution.mcp_servers)
      .filter(([, server]) => server.plugin === pluginId)
      .map(([name, server]) => {
        const row = server as { spec?: { type?: unknown }; defer?: unknown };
        const type = typeof row.spec?.type === 'string' ? row.spec.type : '';
        return {
          id: name,
          category: 'mcp' as const,
          plugin: pluginId,
          description: type ? `Starts a ${type} server` : '',
          note: row.defer === true ? DEFERRED_NOTE : undefined,
        };
      }),
    subagents: described('subagents', own(resolution.subagents)),
    skills: described('skills', own(resolution.skills)),
    prompts: resolution.prompt.sections.flatMap((section) =>
      own(section.fragments).map((fragment) => ({
        id: fragment.id,
        category: 'prompts' as const,
        plugin: pluginId,
        description: [
          promptSectionLabel(fragment.section || section.section),
          fragment.tokens !== undefined ? `about ${fragment.tokens} tokens` : '',
        ]
          .filter(Boolean)
          .join(', '),
        text: fragment.text,
      })),
    ),
    commands: described('commands', own(resolution.commands)),
    flows: described('flows', own(resolution.flows)),
    hooks: described('hooks', own(resolution.hooks)),
  };
}

/** "1 subagent", "2 subagents". */
export function countOf(category: PackageCategory, count: number): string {
  const info = PACKAGE_CATEGORY[category];
  return `${count} ${count === 1 ? info.singular : info.plural}`;
}

/** "hpc-io brings these subagents", "ndp brings this tool". */
export function bringsLabel(plugin: string, category: PackageCategory, count: number): string {
  const info = PACKAGE_CATEGORY[category];
  return count === 1
    ? `${plugin} brings this ${info.singular}`
    : `${plugin} brings these ${info.plural}`;
}

/** The categories any of the agent's packages bring, in filter order. */
export function presentCategories(
  byPlugin: ReadonlyMap<string, PackageItems>,
): PackageCategoryInfo[] {
  return PACKAGE_CATEGORIES.filter((info) =>
    [...byPlugin.values()].some((items) => items[info.value].length > 0),
  );
}
