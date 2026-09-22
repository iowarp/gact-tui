/**
 * Human labels for a tool's functional domain.
 *
 * The server declares a tool's domain as one of the fixed tokens below
 * (`ToolCatalogItem.domain`, clio-agent's `ToolDomain` — #1350). A declared
 * domain always wins over any client-side guess; callers keep their own
 * name-based fallback (e.g. `catalog-toolset.tsx`'s `clioDomainForName`) for
 * a tool that declared none.
 */
import { PROTOCOL, vocab } from './brand-vocabulary';

/** The closed vocabulary a server-declared `domain` may use (clio-agent's `ToolDomain`). */
export type ToolDomain =
  | 'workspace'
  | 'shell'
  | 'artifacts'
  | 'planning'
  | 'tasks'
  | 'schedules'
  | 'autonomy'
  | 'goals'
  | 'alerts'
  | 'resources'
  | 'surfaces'
  | 'providers'
  | 'memory'
  | 'agents'
  | 'workflows'
  | 'skills'
  | 'messaging'
  | 'interaction';

/** One owner table for every `ToolDomain` token's reader-facing label. */
export const TOOL_DOMAIN_LABELS: Record<ToolDomain, string> = {
  workspace: `Files & ${vocab.workspace}`,
  shell: 'Commands',
  artifacts: 'Artifacts',
  planning: 'Planning',
  tasks: 'Tasks',
  schedules: 'Schedules',
  autonomy: 'Autonomy',
  goals: 'Goals',
  alerts: 'Alerts',
  resources: 'Resources',
  surfaces: `Interactive surfaces (${PROTOCOL.a2ui})`,
  providers: 'Model providers',
  memory: 'Memory',
  agents: 'Agents',
  workflows: 'Workflows',
  skills: 'Skills',
  messaging: 'Messaging',
  interaction: 'Questions',
};

function isToolDomain(value: string): value is ToolDomain {
  return Object.hasOwn(TOOL_DOMAIN_LABELS, value);
}

/** The reader-facing label for a server-declared domain token, or `undefined` for an absent or unrecognized one. */
export function toolDomainLabel(domain: string | null | undefined): string | undefined {
  if (!domain) return undefined;
  return isToolDomain(domain) ? TOOL_DOMAIN_LABELS[domain] : undefined;
}
