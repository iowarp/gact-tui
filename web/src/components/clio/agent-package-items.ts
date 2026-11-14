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
import { plural, t } from '@lingui/core/macro';

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
  /** The kind of one item, as a field value: "Tool". */
  kind: string;
}

/** The filter's order; a category shows only when some package brings it. */
export const PACKAGE_CATEGORIES: readonly PackageCategoryInfo[] = [
  { value: 'tools', label: t`Tools`, kind: t`Tool` },
  { value: 'subagents', label: t`Subagents`, kind: t`Subagent` },
  { value: 'skills', label: t`Skills`, kind: t`Skill` },
  { value: 'prompts', label: t`Prompts`, kind: t`Prompt part` },
  // i18n-ignore: protocol name, identical in every language
  { value: 'mcp', label: 'MCP', kind: t`MCP server` },
  { value: 'commands', label: t`Commands`, kind: t`Command` },
  { value: 'flows', label: t`Flows`, kind: t`Flow` },
  { value: 'hooks', label: t`Hooks`, kind: t`Hook` },
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

const DEFERRED_NOTE = t`Loaded when needed`;

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
          description: type ? t`Starts a ${type} server` : '',
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
          fragment.tokens !== undefined
            ? plural(fragment.tokens, { one: 'about # token', other: 'about # tokens' })
            : '',
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
  switch (category) {
    case 'tools':
      return plural(count, { one: '# tool', other: '# tools' });
    case 'subagents':
      return plural(count, { one: '# subagent', other: '# subagents' });
    case 'skills':
      return plural(count, { one: '# skill', other: '# skills' });
    case 'prompts':
      return plural(count, { one: '# prompt part', other: '# prompt parts' });
    case 'mcp':
      return plural(count, { one: '# MCP server', other: '# MCP servers' });
    case 'commands':
      return plural(count, { one: '# command', other: '# commands' });
    case 'flows':
      return plural(count, { one: '# flow', other: '# flows' });
    case 'hooks':
      return plural(count, { one: '# hook', other: '# hooks' });
  }
}

/** "hpc-io brings these subagents", "ndp brings this tool". */
export function bringsLabel(plugin: string, category: PackageCategory, count: number): string {
  switch (category) {
    case 'tools':
      return plural(count, {
        one: `${plugin} brings this tool`,
        other: `${plugin} brings these tools`,
      });
    case 'subagents':
      return plural(count, {
        one: `${plugin} brings this subagent`,
        other: `${plugin} brings these subagents`,
      });
    case 'skills':
      return plural(count, {
        one: `${plugin} brings this skill`,
        other: `${plugin} brings these skills`,
      });
    case 'prompts':
      return plural(count, {
        one: `${plugin} brings this prompt part`,
        other: `${plugin} brings these prompt parts`,
      });
    case 'mcp':
      return plural(count, {
        one: `${plugin} brings this MCP server`,
        other: `${plugin} brings these MCP servers`,
      });
    case 'commands':
      return plural(count, {
        one: `${plugin} brings this command`,
        other: `${plugin} brings these commands`,
      });
    case 'flows':
      return plural(count, {
        one: `${plugin} brings this flow`,
        other: `${plugin} brings these flows`,
      });
    case 'hooks':
      return plural(count, {
        one: `${plugin} brings this hook`,
        other: `${plugin} brings these hooks`,
      });
  }
}

/** "No package brings subagents." */
export function noneBringsLabel(category: PackageCategory): string {
  switch (category) {
    case 'tools':
      return t`No package brings tools.`;
    case 'subagents':
      return t`No package brings subagents.`;
    case 'skills':
      return t`No package brings skills.`;
    case 'prompts':
      return t`No package brings prompt parts.`;
    case 'mcp':
      return t`No package brings MCP servers.`;
    case 'commands':
      return t`No package brings commands.`;
    case 'flows':
      return t`No package brings flows.`;
    case 'hooks':
      return t`No package brings hooks.`;
  }
}

/** "hpc-io subagents": one category of what one package brings. */
export function packageCategoryLabel(plugin: string, category: PackageCategory): string {
  switch (category) {
    case 'tools':
      return t`${plugin} tools`;
    case 'subagents':
      return t`${plugin} subagents`;
    case 'skills':
      return t`${plugin} skills`;
    case 'prompts':
      return t`${plugin} prompt parts`;
    case 'mcp':
      return t`${plugin} MCP servers`;
    case 'commands':
      return t`${plugin} commands`;
    case 'flows':
      return t`${plugin} flows`;
    case 'hooks':
      return t`${plugin} hooks`;
  }
}

/** The categories any of the agent's packages bring, in filter order. */
export function presentCategories(
  byPlugin: ReadonlyMap<string, PackageItems>,
): PackageCategoryInfo[] {
  return PACKAGE_CATEGORIES.filter((info) =>
    [...byPlugin.values()].some((items) => items[info.value].length > 0),
  );
}
