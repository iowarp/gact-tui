import type { AgentResolution } from '@clio/core/v3';
import type { PluginContributions } from '@/lib/plugin-presentation';
import { plural, t } from '@lingui/core/macro';

/** The things an agent can use, each opening its own view in the Agent tab. */
export type AgentUseKind = 'tools' | 'subagents' | 'skills' | 'instructions';

export const AGENT_USE_LABELS: Record<AgentUseKind, string> = {
  tools: t`Tools`,
  subagents: t`Subagents`,
  skills: t`Skills`,
  instructions: t`Instructions`,
};

/** One "What it can use" value and whether it differs from the setup's. */
export interface AgentUseValue {
  text: string;
  changed: boolean;
}

/** Which plugins a drill-in lists: those that contribute that kind of thing. */
export const AGENT_USE_FILTERS: Record<
  Exclude<AgentUseKind, 'instructions'>,
  (contributions: PluginContributions) => boolean
> = {
  tools: (c) => c.tools.length + c.deferredTools.length + c.mcpServers.length > 0,
  subagents: (c) => c.subagents.length > 0,
  skills: (c) => c.skills.length > 0,
};

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((value) => set.has(value));
}

function names(rows: readonly { id: string }[]): string[] {
  return [...new Set(rows.map((row) => row.id))];
}

/**
 * Where the prompt's instructions come from, other than the agent itself and
 * its plugins: a workspace or person file.
 */
function instructionSources(resolution: AgentResolution): string[] {
  const plugins = new Set(resolution.plugins.map((plugin) => plugin.id));
  const owners = [
    ...new Set(
      resolution.prompt.sections.flatMap((section) =>
        section.fragments.map((fragment) => fragment.plugin),
      ),
    ),
  ].filter(Boolean);
  return owners.filter((owner) => !owner.startsWith('agent:') && !plugins.has(owner));
}

function fragmentIds(resolution: AgentResolution): string[] {
  return resolution.prompt.sections.flatMap((section) =>
    section.fragments.map((fragment) => fragment.id),
  );
}

function listed(values: readonly string[]): string {
  return values.length ? values.join(', ') : t`None`;
}

/**
 * The "What it can use" values: what the conversation's agent has, compared
 * with `setup` (the same agent without this conversation's plugin changes).
 * Without a setup to compare with, nothing reads as changed.
 */
export function agentUseValues(
  resolution: AgentResolution,
  setup: AgentResolution | undefined,
): Record<AgentUseKind, AgentUseValue> {
  const tools = resolution.tools.map((tool) => tool.name);
  const setupTools = setup?.tools.map((tool) => tool.name);
  const toolsChanged = Boolean(setupTools && !sameSet(tools, setupTools));
  const subset = setupTools && tools.every((tool) => setupTools.includes(tool));
  const toolCount = tools.length;
  const setupToolCount = setupTools?.length ?? 0;
  const toolsText = !toolsChanged
    ? t`All ${toolCount}`
    : subset
      ? t`${toolCount} of ${setupToolCount}`
      : t`${toolCount}, the setup has ${setupToolCount}`;
  const subagents = names(resolution.subagents);
  const skills = names(resolution.skills);
  const sources = instructionSources(resolution);
  const parts = fragmentIds(resolution);
  const firstSource = sources[0] ?? '';
  const moreSources = sources.length - 1;
  const instructionsText = sources.length
    ? moreSources > 0
      ? t`From ${firstSource} and ${moreSources} more`
      : t`From ${firstSource}`
    : plural(parts.length, { one: '# prompt part', other: '# prompt parts' });
  return {
    tools: { text: toolsText, changed: toolsChanged },
    subagents: {
      text: listed(subagents),
      changed: Boolean(setup && !sameSet(subagents, names(setup.subagents))),
    },
    skills: {
      text: listed(skills),
      changed: Boolean(setup && !sameSet(skills, names(setup.skills))),
    },
    instructions: {
      text: instructionsText,
      changed: Boolean(setup && !sameSet(parts, fragmentIds(setup))),
    },
  };
}

/** Words for a value that differs from the setup, read after the value. */
export const CHANGED_FOR_CONVERSATION = t`changed for this conversation`;
