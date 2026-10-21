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
  provenanceLabel,
  removedPluginReason,
  type PluginContributions,
} from '@/lib/plugin-presentation';
import { PluginChangePendingNotice } from './plugin-change-pending-notice';

const STILL_IN_PROMPT = 'Still in the agent’s prompt until compaction';

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
}: AgentPluginTreeProps) {
  const pendingChange = basis?.pending ? basis : undefined;
  const announced = new Set(pendingChange?.added);
  const inPrompt = new Set(pendingChange?.removed);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
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
      onRemove={readOnly ? undefined : onRemove}
      open={expanded.has(plugin.id)}
      pending={pending}
      plugin={plugin}
    />
  );
  return (
    <div className="grid gap-4">
      {pendingChange ? (
        <PluginChangePendingNotice
          basis={pendingChange}
          compacting={compacting}
          onCompact={readOnly ? undefined : onCompact}
        />
      ) : null}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Select a plugin to see what it adds.</p>
          <Button
            onClick={() =>
              setExpanded(
                allExpanded ? new Set() : new Set(resolution.plugins.map((plugin) => plugin.id)),
              )
            }
            size="xs"
            variant="ghost"
          >
            {allExpanded ? 'Collapse all' : 'Expand all'}
          </Button>
        </div>
        <ul aria-label="Active plugins" className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
          {resolution.plugins
            .filter((plugin) => !nested(plugin))
            .map((plugin) => (
              <li key={plugin.id}>
                {node(plugin)}
                {plugin.kind === 'pack' ? (
                  <ul
                    aria-label={`Members of ${plugin.id}`}
                    className="ml-[0.9rem] grid grid-cols-[minmax(0,1fr)]"
                  >
                    {plugin.members.map((member) => {
                      const row = byId.get(member);
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
                                {member} · not in this conversation
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
        <section aria-label="Removed plugins" className="grid gap-2">
          <h3 className="text-sm font-semibold">Removed in this conversation</h3>
          <ul className="grid gap-1">
            {removedByPerson.map((id) => (
              <li
                className="flex min-w-0 flex-wrap items-center gap-x-2 rounded-md border px-2.5 py-1.5 text-sm"
                key={id}
              >
                <span className="font-medium">{id}</span>
                <span className="text-xs text-muted-foreground">Removed by you</span>
                {inPrompt.has(pluginReferenceId(id)) ? <StillInPrompt /> : null}
                {readOnly ? null : (
                  <Button
                    className="ml-auto"
                    disabled={pending}
                    onClick={() => onAddBack(id)}
                    size="xs"
                    variant="ghost"
                  >
                    Add back
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
}: {
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
        <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
          <CollapsibleTrigger className="min-w-0 truncate text-left text-sm font-medium outline-none after:absolute after:inset-0 after:rounded-md">
            {plugin.id}
          </CollapsibleTrigger>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge className="relative z-10" tabIndex={0} variant="outline">
                {provenanceLabel(plugin.provenance)}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>{provenanceDetail(plugin.provenance)}</TooltipContent>
          </Tooltip>
          {announced ? (
            <Badge className="relative z-10 font-normal" variant="secondary">
              Announced to the agent
            </Badge>
          ) : null}
          <span className="max-w-full text-xs text-muted-foreground">{summary}</span>
        </div>
        {onRemove && plugin.removable ? (
          <Button
            aria-label={`Remove ${plugin.id}`}
            className="relative z-10 -my-0.5"
            disabled={pending}
            onClick={() => onRemove(plugin.id)}
            size="icon-xs"
            title={`Remove ${plugin.id}`}
            variant="ghost"
          >
            <RemoveIcon aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <CollapsibleContent>
        <PluginDetails contributions={contributions} plugin={plugin} />
      </CollapsibleContent>
    </Collapsible>
  );
}

/** One plugin's details: only what the resolution reports for it. */
function PluginDetails({
  plugin,
  contributions,
}: {
  plugin: ResolvedPlugin;
  contributions: PluginContributions;
}) {
  const c = contributions;
  return (
    <div
      aria-label={`${plugin.id} details`}
      className="mb-1.5 ml-[1.375rem] grid gap-2 border-l py-1 pl-3 text-sm"
      role="group"
    >
      {plugin.description ? <p className="text-muted-foreground">{plugin.description}</p> : null}
      <dl className="grid gap-2">
        {c.tools.length ? (
          <DetailRow label={`Tools (${c.tools.length})`}>
            <NameChips names={c.tools} />
          </DetailRow>
        ) : null}
        {c.skills.length ? (
          <DetailRow label={`Skills (${c.skills.length})`}>
            <DescribedList rows={c.skills} />
          </DetailRow>
        ) : null}
        {c.fragments.length ? (
          <DetailRow label={`Prompt parts (${c.fragments.length})`}>
            <ul className="grid gap-0.5">
              {c.fragments.map((fragment) => (
                <li className="flex min-w-0 flex-wrap items-baseline gap-x-2" key={fragment.id}>
                  <span className="font-mono text-xs break-all">{fragment.id}</span>
                  <span className="text-xs text-muted-foreground">
                    {promptSectionLabel(fragment.section)}
                    {fragment.tokens !== undefined ? ` · about ${fragment.tokens} tokens` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </DetailRow>
        ) : null}
        {c.mcpServers.length ? (
          <DetailRow label="MCP servers">
            <ul className="grid gap-0.5">
              {c.mcpServers.map((server) => (
                <li className="flex flex-wrap items-baseline gap-x-2" key={server.name}>
                  <span className="font-mono text-xs">{server.name}</span>
                  {server.type ? (
                    <span className="text-xs text-muted-foreground">{server.type}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </DetailRow>
        ) : null}
        {c.flows.length ? (
          <DetailRow label="Flows">
            <DescribedList rows={c.flows} />
          </DetailRow>
        ) : null}
        {c.subagents.length ? (
          <DetailRow label="Subagents">
            <DescribedList rows={c.subagents} />
          </DetailRow>
        ) : null}
        {c.commands.length ? (
          <DetailRow label="Commands">
            <DescribedList rows={c.commands} />
          </DetailRow>
        ) : null}
        {c.hooks.length ? (
          <DetailRow label="Hooks">
            <DescribedList rows={c.hooks} />
          </DetailRow>
        ) : null}
        {c.catalogs.length ? (
          <DetailRow label="Catalogs">
            <NameChips names={c.catalogs.map((row) => row.id)} />
          </DetailRow>
        ) : null}
        {plugin.requires.length ? (
          <DetailRow label="Requires">
            <NameChips names={plugin.requires} />
          </DetailRow>
        ) : null}
        {c.requiredBy.length ? (
          <DetailRow label="Required by">
            <NameChips names={c.requiredBy} />
          </DetailRow>
        ) : null}
        {c.diagnostics.length ? (
          <DetailRow label="Notes">
            <ul className="grid gap-0.5 text-xs text-muted-foreground">
              {c.diagnostics.map((row, index) => (
                <li key={`${row.code}-${index}`}>
                  <span className="font-medium capitalize">{row.severity}</span>: {row.message}
                </li>
              ))}
            </ul>
          </DetailRow>
        ) : null}
        <DetailRow label="Source">
          <span className="text-xs text-muted-foreground">
            {[
              plugin.version ? `Version ${plugin.version}` : 'Version not reported',
              plugin.marketplace ? `from ${plugin.marketplace}` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
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
