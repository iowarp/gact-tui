import type { AgentResolution } from '@clio/core/v3';
import type { PackageItem } from './agent-package-items';
import type { KeyValueItem } from './primitives/key-value-grid';
import { t } from '@lingui/core/macro';

export type Subagent = AgentResolution['subagents'][number];

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const strings = (value: unknown): string[] | undefined =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : undefined;

/** The resolution's row for this subagent; it carries the prompt and preferences the server resolved. */
export function subagentRow(resolution: AgentResolution, item: PackageItem): Subagent | undefined {
  return resolution.subagents.find((row) => row.id === item.id && row.plugin === item.plugin);
}

/**
 * What a subagent runs with, in words: its model preference, reasoning,
 * tools, packages and access. Only facts the server reported appear.
 */
export function subagentFacts(row: Subagent): KeyValueItem[] {
  const prefers = (row.prefers ?? {}) as Record<string, unknown>;
  const model = text(prefers.model);
  const role = text(prefers.role);
  const effort = text(prefers.effort);
  const tools = row.tools === null ? null : strings(row.tools);
  const plugins = strings(row.plugins);
  const facts: KeyValueItem[] = [];
  if ('prefers' in row)
    facts.push({
      label: t`Model`,
      value:
        model ||
        (role ? `The ${role} model from Fleet settings` : 'Same as the agent that calls it'),
      mono: Boolean(model),
    });
  if (effort) facts.push({ label: t`Reasoning`, value: effort });
  if (tools === null) facts.push({ label: t`Tools`, value: 'Every tool its packages bring' });
  else if (tools)
    facts.push({
      label: t`Tools`,
      value: tools.length ? tools.join(', ') : 'None',
      title: tools.join(', '),
    });
  if (text(row.derive) === 'caller')
    facts.push({ label: t`Packages`, value: 'The packages of the agent that calls it' });
  else if (plugins?.length)
    facts.push({
      label: t`Packages`,
      value: plugins.join(', '),
      title: plugins.join(', '),
    });
  if (text(row.effects) === 'read') facts.push({ label: t`Access`, value: 'Read-only' });
  const flow = text(row.flow);
  if (flow && flow !== 'react') facts.push({ label: t`Flow`, value: flow, mono: true });
  if (typeof row.max_iters === 'number' && row.max_iters > 0)
    facts.push({ label: t`Step limit`, value: `${row.max_iters} steps` });
  if (row.internal === true)
    facts.push({ label: t`Use`, value: 'Internal: the agent’s own flows call it' });
  // The pane is narrow and these are read, not scanned: wrap rather than cut.
  return facts.map((fact) => ({ ...fact, wrap: true }));
}
