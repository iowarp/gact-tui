import {
  pluginReferenceId,
  type AgentDelta,
  type AgentResolution,
  type PromptBasis,
  type ResolvedPlugin,
} from '@clio/core/v3';
import { BoxesIcon, ChevronRightIcon, PackageIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RemoveIcon } from '@/lib/icon-vocabulary';
import {
  capabilitySummary,
  packMembersLabel,
  pluginContributions,
  promptSectionLabel,
  provenanceDetail,
  resolvedPluginName,
  resolvedPluginOrigin,
  removedPluginReason,
  type PluginContributions,
} from '@/lib/plugin-presentation';
import { ConnectorLogo } from './connector-need-rows';
import { PluginExplorer } from './plugin-explorer';
import { PluginChangePendingNotice } from './plugin-change-pending-notice';
import { StateView } from './primitives/state-view';
import { plural, t, ph } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

const STILL_IN_PROMPT = t`Still in the agent’s prompt until compaction`;

export interface AgentPluginTreeProps {
  resolution: AgentResolution;
  delta: AgentDelta;
  readOnly: boolean;
  pending: boolean;
  onRemove: (plugin: string) => void;
  onAddBack: (plugin: string) => void;
  /** The prompt the model has; while `pending`, a change waits for compaction. */
  basis?: PromptBasis;
  compacting?: boolean;
  onCompact?: () => void;
  /**
   * Lists only the plugins whose contributions match (a pack when one of its
   * members does), with a control to show every plugin.
   */
  filter?: (contributions: PluginContributions) => boolean;
  /** What the filter keeps: tools, subagents or skills. */
  filterKind?: PluginFilterKind;
}

export type PluginFilterKind = 'tools' | 'subagents' | 'skills';

const DIAGNOSTIC_SEVERITY_LABELS: Partial<Record<string, string>> = {
  error: t`Error`,
  warning: t`Warning`,
  info: t({ message: 'Info', context: 'severity' }),
};

function showOnlyFilteredLabel(kind: PluginFilterKind | undefined): string {
  switch (kind) {
    case 'tools':
      return t`Show only the plugins that add tools`;
    case 'subagents':
      return t`Show only the plugins that add subagents`;
    case 'skills':
      return t`Show only the plugins that add skills`;
    default:
      return t`Show only the plugins that add these`;
  }
}

function noPluginAddsLabel(kind: PluginFilterKind | undefined): string {
  switch (kind) {
    case 'tools':
      return t`No plugin adds tools`;
    case 'subagents':
      return t`No plugin adds subagents`;
    case 'skills':
      return t`No plugin adds skills`;
    default:
      return t`No plugin adds these`;
  }
}

/**
 * The conversation's plugins as a compact tree: one line per plugin with its
 * origin and a count of what it adds, packs as parents of their members, and
 * each line expanding to the tools, skills, prompt parts and links the
 * resolution attributes to that plugin.
 */
export function AgentPluginTree({
  resolution,
  delta,
  readOnly,
  pending,
  onRemove,
  onAddBack,
  basis,
  compacting = false,
  onCompact,
  filter,
  filterKind,
}: AgentPluginTreeProps) {
  const [showAll, setShowAll] = useState(false);
  const pendingChange = basis?.pending ? basis : undefined;
  const announced = new Set(pendingChange?.added);
  const inPrompt = new Set(pendingChange?.removed);
  const [inspecting, setInspecting] = useState<string>();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(resolution.plugins.filter((p) => p.kind === 'pack').map((p) => p.id)),
  );
  const byId = new Map(resolution.plugins.map((plugin) => [plugin.id, plugin]));
  const packIds = new Set(
    resolution.plugins.filter((plugin) => plugin.kind === 'pack').map((plugin) => plugin.id),
  );
  const nested = (plugin: ResolvedPlugin) =>
    plugin.provenance.source === 'pack' && packIds.has(plugin.provenance.via);
  const removedIds = new Set(delta.remove.map(pluginReferenceId));
  const removedByPerson = delta.remove.filter(
    (reference) => !byId.has(pluginReferenceId(reference)),
  );
  const cascaded = resolution.removed.filter((row) => !removedIds.has(row.id));
  const filtering = Boolean(filter) && !showAll;
  const matches = (plugin: ResolvedPlugin): boolean =>
    !filter ||
    filter(pluginContributions(resolution, plugin.id)) ||
    plugin.members.some((member) => {
      const row = byId.get(member);
      return row ? matches(row) : false;
    });
  const shown = (plugin: ResolvedPlugin) => !filtering || matches(plugin);
  const topLevel = resolution.plugins.filter((plugin) => !nested(plugin) && shown(plugin));
  const allExpanded = resolution.plugins.every((plugin) => expanded.has(plugin.id));
  const toggle = (id: string, open: boolean) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  const node = (plugin: ResolvedPlugin) => (
    <PluginNode
      activeMembers={plugin.members.filter((member) => byId.has(member)).length}
      announced={announced.has(plugin.id)}
      contributions={pluginContributions(resolution, plugin.id)}
      onOpenChange={(open) => toggle(plugin.id, open)}
      onInspect={() => setInspecting(`${plugin.marketplace}/${plugin.id}`)}
      onRemove={readOnly ? undefined : onRemove}
      open={expanded.has(plugin.id)}
      pending={pending}
      plugin={plugin}
    />
  );
  return (
    <div className="grid gap-4">
      {inspecting ? (
        <PluginExplorer
          key={inspecting}
          reference={inspecting}
          onClose={() => setInspecting(undefined)}
        />
      ) : null}
      {pendingChange ? (
        <PluginChangePendingNotice
          basis={pendingChange}
          compacting={compacting}
          onCompact={readOnly ? undefined : onCompact}
        />
      ) : null}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-xs text-muted-foreground">
            {t`Select a plugin to see what it adds.`}
          </p>
          {filter ? (
            <Button
              aria-pressed={showAll}
              className="ml-auto"
              onClick={() => setShowAll((current) => !current)}
              size="xs"
              title={showAll ? showOnlyFilteredLabel(filterKind) : undefined}
              variant="ghost"
            >
              {plural(resolution.plugins.length, {
                one: 'Show all # plugin',
                other: 'Show all # plugins',
              })}
            </Button>
          ) : null}
          <Button
            onClick={() =>
              setExpanded(
                allExpanded ? new Set() : new Set(resolution.plugins.map((plugin) => plugin.id)),
              )
            }
            size="xs"
            variant="ghost"
          >
            {allExpanded ? t`Collapse all` : t`Expand all`}
          </Button>
        </div>
        {topLevel.length === 0 ? (
          <StateView kind="empty" size="row" title={noPluginAddsLabel(filterKind)} />
        ) : null}
        <ul aria-label={t`Active plugins`} className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
          {topLevel.map((plugin) => (
            <li key={plugin.id}>
              {node(plugin)}
              {plugin.kind === 'pack' && expanded.has(plugin.id) ? (
                <ul
                  aria-label={t`Members of ${ph({ id: plugin.id })}`}
                  className="ml-[0.9rem] grid grid-cols-[minmax(0,1fr)]"
                >
                  {plugin.members.map((member) => {
                    const row = byId.get(member);
                    if (filtering && !(row && matches(row))) return null;
                    return (
                      <li
                        className="relative pl-4 before:absolute before:top-[0.95rem] before:left-0 before:w-3 before:border-t after:absolute after:top-0 after:left-0 after:h-full after:border-l last:after:h-[0.95rem]"
                        key={member}
                      >
                        {row ? (
                          node(row)
                        ) : (
                          <p className="flex min-w-0 items-center gap-1.5 py-1.5 pl-5 text-sm text-muted-foreground opacity-75">
                            <PackageIcon aria-hidden="true" className="size-4 shrink-0" />
                            <span className="min-w-0 truncate">
                              {t`${member} (not in this conversation)`}
                            </span>
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      {removedByPerson.length || cascaded.length ? (
        <section aria-label={t`Removed plugins`} className="grid gap-2">
          <h3 className="text-sm font-semibold">{t`Removed in this conversation`}</h3>
          <ul className="grid gap-1">
            {removedByPerson.map((id) => (
              <li
                className="flex min-w-0 flex-wrap items-center gap-x-2 rounded-md border px-2.5 py-1.5 text-sm"
                key={id}
              >
                <span className="font-medium">{id}</span>
                <span className="text-xs text-muted-foreground">{t`Removed by you`}</span>
                {inPrompt.has(pluginReferenceId(id)) ? <StillInPrompt /> : null}
                {readOnly ? null : (
                  <Button
                    className="ml-auto"
                    disabled={pending}
                    onClick={() => onAddBack(id)}
                    size="xs"
                    variant="ghost"
                  >
                    {t`Add back`}
                  </Button>
                )}
              </li>
            ))}
            {cascaded.map((row) => (
              <li
                className="flex min-w-0 flex-wrap items-center gap-x-2 rounded-md border px-2.5 py-1.5 text-sm"
                key={row.id}
              >
                <span className="font-medium">{row.id}</span>
                <span className="text-xs text-muted-foreground">{removedPluginReason(row)}</span>
                {inPrompt.has(row.id) ? <StillInPrompt /> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function StillInPrompt() {
  return (
    <Badge className="h-auto max-w-full shrink font-normal whitespace-normal" variant="secondary">
      {STILL_IN_PROMPT}
    </Badge>
  );
}

function PluginNode({
  plugin,
  contributions,
  activeMembers,
  announced,
  open,
  pending,
  onOpenChange,
  onRemove,
  onInspect,
}: {
  onInspect: () => void;
  plugin: ResolvedPlugin;
  contributions: PluginContributions;
  /** For a pack: how many of its members are active in this conversation. */
  activeMembers: number;
  /** Added as an injection: the agent was told, its prompt does not list it yet. */
  announced: boolean;
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onRemove?: (plugin: string) => void;
}) {
  const Icon = plugin.kind === 'pack' ? BoxesIcon : PackageIcon;
  const summary =
    plugin.kind === 'pack'
      ? packMembersLabel(plugin.members.length, activeMembers)
      : capabilitySummary(contributions);
  return (
    <Collapsible className="group/plugin" onOpenChange={onOpenChange} open={open}>
      {/* The trigger's overlay covers the whole line, so a click anywhere toggles it; the
          badge and the remove button sit above the overlay. */}
      <div className="relative flex min-w-0 items-start gap-1.5 rounded-md px-1 py-1 hover:bg-muted/60 has-[[data-slot=collapsible-trigger]:focus-visible]:ring-2 has-[[data-slot=collapsible-trigger]:focus-visible]:ring-ring/60">
        <ChevronRightIcon
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/plugin:rotate-90 motion-reduce:transition-none"
        />
        {plugin.connector ? (
          <ConnectorLogo
            className="mt-0.5 size-4 text-[8px]"
            connector={{ ...plugin.connector, name: resolvedPluginName(plugin) }}
          />
        ) : (
          <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        )}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
          <CollapsibleTrigger className="min-w-0 truncate text-left text-sm font-medium outline-none after:absolute after:inset-0 after:rounded-md">
            {resolvedPluginName(plugin)}
          </CollapsibleTrigger>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge className="relative z-10" tabIndex={0} variant="outline">
                {resolvedPluginOrigin(plugin)}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>{provenanceDetail(plugin.provenance)}</TooltipContent>
          </Tooltip>
          {announced ? (
            <Badge className="relative z-10 font-normal" variant="secondary">
              {t`Announced to the agent`}
            </Badge>
          ) : null}
          {plugin.kind === 'pack' ? (
            <button
              type="button"
              aria-label={t`Explore ${ph({ id: plugin.id })} files`}
              title={t`Explore ${ph({ id: plugin.id })} files`}
              onClick={onInspect}
              className="relative z-10 max-w-full text-left text-xs text-muted-foreground hover:underline"
            >
              {summary}
            </button>
          ) : (
            <span className="max-w-full text-xs text-muted-foreground">{summary}</span>
          )}
        </div>
        {onRemove && plugin.removable ? (
          <Button
            aria-label={t`Remove ${ph({ id: plugin.id })}`}
            className="relative z-10 -my-0.5"
            disabled={pending}
            onClick={() => onRemove(plugin.id)}
            size="icon-xs"
            title={t`Remove ${ph({ id: plugin.id })}`}
            variant="ghost"
          >
            <RemoveIcon aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <CollapsibleContent>
        {plugin.kind !== 'pack' ? (
          <PluginDetails contributions={contributions} plugin={plugin} onInspect={onInspect} />
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** One plugin's details: only what the resolution reports for it. */
function PluginDetails({
  plugin,
  contributions,
  onInspect,
}: {
  onInspect: () => void;
  plugin: ResolvedPlugin;
  contributions: PluginContributions;
}) {
  const c = contributions;
  return (
    <div
      aria-label={t`${ph({ id: plugin.id })} details`}
      className="mb-1.5 ml-[1.375rem] grid gap-2 border-l py-1 pl-3 text-sm"
      role="group"
    >
      {plugin.description ? <p className="text-muted-foreground">{plugin.description}</p> : null}
      <Button onClick={onInspect} size="sm" variant="outline" className="w-fit">
        {t`Explore files`}
      </Button>
      <dl className="grid gap-2">
        {c.tools.length ? (
          <DetailRow label={t`Tools (${ph({ length: c.tools.length })})`}>
            <NameChips names={c.tools} />
          </DetailRow>
        ) : null}
        {c.deferredTools.length ? (
          <DetailRow label={t`Loaded when needed (${ph({ length: c.deferredTools.length })})`}>
            <p className="mb-1 text-xs text-muted-foreground">
              {t`Named in the prompt; the agent loads their details with a tool search before using them.`}
            </p>
            <NameChips names={c.deferredTools} />
          </DetailRow>
        ) : null}
        {c.skills.length ? (
          <DetailRow label={t`Skills (${ph({ length: c.skills.length })})`}>
            <DescribedList rows={c.skills} />
          </DetailRow>
        ) : null}
        {c.fragments.length ? (
          <DetailRow label={t`Prompt parts (${ph({ length: c.fragments.length })})`}>
            <ul className="grid gap-0.5">
              {c.fragments.map((fragment) => (
                <li className="flex min-w-0 flex-wrap items-baseline gap-x-2" key={fragment.id}>
                  <span className="font-mono text-xs break-all">{fragment.id}</span>
                  <span className="text-xs text-muted-foreground">
                    {promptSectionLabel(fragment.section)}
                    {fragment.tokens !== undefined
                      ? plural(fragment.tokens, {
                          one: ', about # token',
                          other: ', about # tokens',
                        })
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
          </DetailRow>
        ) : null}
        {c.mcpServers.length ? (
          <DetailRow label={t`MCP servers`}>
            <ul className="grid gap-0.5">
              {c.mcpServers.map((server) => (
                <li className="flex flex-wrap items-baseline gap-x-2" key={server.name}>
                  <span className="font-mono text-xs">{server.name}</span>
                  {server.type ? (
                    <span className="text-xs text-muted-foreground">{server.type}</span>
                  ) : null}
                  {server.deferred ? (
                    <span className="text-xs text-muted-foreground">{t`tools loaded when needed`}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </DetailRow>
        ) : null}
        {c.flows.length ? (
          <DetailRow label={t`Flows`}>
            <DescribedList rows={c.flows} />
          </DetailRow>
        ) : null}
        {c.subagents.length ? (
          <DetailRow label={t`Subagents`}>
            <DescribedList rows={c.subagents} />
          </DetailRow>
        ) : null}
        {c.commands.length ? (
          <DetailRow label={t`Commands`}>
            <DescribedList rows={c.commands} />
          </DetailRow>
        ) : null}
        {c.hooks.length ? (
          <DetailRow label={t`Hooks`}>
            <DescribedList rows={c.hooks} />
          </DetailRow>
        ) : null}
        {c.catalogs.length ? (
          <DetailRow label={t`Catalogs`}>
            <NameChips names={c.catalogs.map((row) => row.id)} />
          </DetailRow>
        ) : null}
        {plugin.requires.length ? (
          <DetailRow label={t`Requires`}>
            <NameChips names={plugin.requires} />
          </DetailRow>
        ) : null}
        {c.requiredBy.length ? (
          <DetailRow label={t`Required by`}>
            <NameChips names={c.requiredBy} />
          </DetailRow>
        ) : null}
        {c.diagnostics.length ? (
          <DetailRow label={t`Notes`}>
            <ul className="grid gap-0.5 text-xs text-muted-foreground">
              {c.diagnostics.map((row, index) => {
                const severity = DIAGNOSTIC_SEVERITY_LABELS[row.severity] ?? row.severity;
                const message = row.message;
                return (
                  <li key={`${row.code}-${index}`}>
                    <Trans>
                      <span className="font-medium capitalize">{severity}</span>: {message}
                    </Trans>
                  </li>
                );
              })}
            </ul>
          </DetailRow>
        ) : null}
        <DetailRow label={t`Source`}>
          <span className="text-xs text-muted-foreground">
            {[
              plugin.version
                ? t`Version ${ph({ version: plugin.version })}`
                : t`Version not reported`,
              plugin.marketplace ? t`from ${ph({ marketplace: plugin.marketplace })}` : '',
            ]
              .filter(Boolean)
              .join(', ')}
          </span>
        </DetailRow>
      </dl>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function NameChips({ names }: { names: readonly string[] }) {
  return (
    <ul className="flex min-w-0 flex-wrap gap-1">
      {names.map((name) => (
        <li className="min-w-0 max-w-full" key={name}>
          <Badge className="max-w-full truncate font-mono font-normal" variant="secondary">
            {name}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function DescribedList({ rows }: { rows: readonly { id: string; description: string }[] }) {
  return (
    <ul className="grid gap-1">
      {rows.map((row) => (
        <li className="min-w-0" key={row.id}>
          <span className="font-mono text-xs break-all">{row.id}</span>
          {row.description ? (
            <p className="line-clamp-2 text-xs text-muted-foreground">{row.description}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
