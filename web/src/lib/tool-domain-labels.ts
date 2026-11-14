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
import { t } from '@lingui/core/macro';

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
  | 'interaction'
  | 'science'
  | 'browser';

const { workspace } = vocab;
const { a2ui } = PROTOCOL;

/** One owner table for every `ToolDomain` token's reader-facing label. */
export const TOOL_DOMAIN_LABELS: Record<ToolDomain, string> = {
  workspace: t`Files & ${workspace}`,
  shell: t`Commands`,
  artifacts: t`Artifacts`,
  planning: t`Planning`,
  tasks: t`Tasks`,
  schedules: t`Schedules`,
  autonomy: t`Autonomy`,
  goals: t`Goals`,
  alerts: t`Alerts`,
  resources: t`Resources`,
  surfaces: t`Interactive surfaces (${a2ui})`,
  providers: t`Model providers`,
  memory: t`Memory`,
  agents: t`Agents`,
  workflows: t`Workflows`,
  skills: t`Skills`,
  messaging: t`Messaging`,
  interaction: t`Questions`,
  science: t`Science log`,
  browser: t`Browser`,
};

function isToolDomain(value: string): value is ToolDomain {
  return Object.hasOwn(TOOL_DOMAIN_LABELS, value);
}

/** The reader-facing label for a server-declared domain token, or `undefined` for an absent or unrecognized one. */
export function toolDomainLabel(domain: string | null | undefined): string | undefined {
  if (!domain) return undefined;
  return isToolDomain(domain) ? TOOL_DOMAIN_LABELS[domain] : undefined;
}
