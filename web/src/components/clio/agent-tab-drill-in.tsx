import type { AgentDelta, AgentResolution, PluginEntry, PromptBasis } from '@clio/core/v3';
import { ArrowLeftIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { AddIcon } from '@/lib/icon-vocabulary';
import { AgentPluginMenu } from './agent-plugin-menu';
import { AgentPluginTree } from './agent-plugin-tree';
import { PackageItemRow } from './agent-package-item-row';
import { bringsLabel, packageItems, type PackageItem } from './agent-package-items';
import { AGENT_USE_FILTERS, AGENT_USE_LABELS, type AgentUseKind } from './agent-tab-values';
import { ComposedPromptView } from './composed-prompt-view';
import { IconButton } from './primitives/icon-button';
import { ItemList } from './primitives/item-row';
import { focusQuietly } from './primitives/quiet-focus';
import { StateView } from './primitives/state-view';
import { SettingsGroupLabel } from './settings-row';

export interface AgentDrillInProps {
  kind: AgentUseKind;
  /** The row's value, repeated beside the title. */
  value: string;
  resolution: AgentResolution;
  delta: AgentDelta;
  readOnly: boolean;
  pending: boolean;
  basis?: PromptBasis;
  compacting: boolean;
  plugins?: readonly PluginEntry[];
  pluginsError?: string;
  onBack: () => void;
  onAdd: (plugin: string) => void;
  onRemove: (plugin: string) => void;
  onAddBack: (plugin: string) => void;
  onCompact: () => void;
  /** Open one subagent or skill on its own. */
  onOpenItem: (item: PackageItem) => void;
}

/**
 * One "What it can use" row opened inside the Agent tab: the plugins that
 * bring that kind of thing (remove, add back, compact, inspect, add), or for
 * Instructions the composed prompt. The back control returns to the rows.
 */
export function AgentDrillIn({
  kind,
  value,
  resolution,
  delta,
  readOnly,
  pending,
  basis,
  compacting,
  plugins,
  pluginsError,
  onBack,
  onAdd,
  onRemove,
  onAddBack,
  onCompact,
  onOpenItem,
}: AgentDrillInProps) {
  const title = AGENT_USE_LABELS[kind];
  const back = useRef<HTMLButtonElement>(null);
  // Arriving keeps focus on Back without its name covering the view.
  useEffect(() => focusQuietly(back.current), []);
  return (
    <section aria-label={title} className="flex min-w-0 flex-col">
      <div className="flex min-h-10 min-w-0 items-center gap-2 border-b border-border px-2.5 py-1.5 text-meta whitespace-nowrap">
        <IconButton
          icon={<ArrowLeftIcon aria-hidden="true" />}
          label="Back to the agent"
          onClick={onBack}
          ref={back}
          size="sm"
        />
        <h3 className="shrink-0 font-medium text-foreground">{title}</h3>
        <span className="min-w-0 truncate text-muted-foreground" title={value}>
          {value}
        </span>
        {!readOnly && kind !== 'instructions' ? (
          <AgentPluginMenu
            delta={delta}
            disabled={pending}
            onAdd={onAdd}
            plugins={plugins}
            pluginsError={pluginsError}
            resolution={resolution}
          >
            <Button className="ml-auto shrink-0" size="xs" variant="outline">
              <AddIcon aria-hidden="true" /> Add plugin
            </Button>
          </AgentPluginMenu>
        ) : null}
      </div>
      <div className="min-w-0 p-3.5">
        {kind === 'instructions' ? (
          <ComposedPromptView resolution={resolution} />
        ) : (
          <>
            {kind === 'subagents' || kind === 'skills' ? (
              <OwnItems kind={kind} onOpenItem={onOpenItem} resolution={resolution} />
            ) : null}
            {kind === 'subagents' || kind === 'skills' ? (
              <SettingsGroupLabel
                className="mt-4 mb-1"
                info="The packages that bring these. Remove one, add it back, or open its files."
              >
                From these packages
              </SettingsGroupLabel>
            ) : null}
            <AgentPluginTree
              basis={basis}
              compacting={compacting}
              delta={delta}
              filter={AGENT_USE_FILTERS[kind]}
              filterNoun={title.toLowerCase()}
              onAddBack={onAddBack}
              onCompact={onCompact}
              onRemove={onRemove}
              pending={pending}
              readOnly={readOnly}
              resolution={resolution}
            />
          </>
        )}
      </div>
    </section>
  );
}

/**
 * The subagents or skills themselves, grouped by the package that brings
 * them; each row opens that subagent's or skill's own details.
 */
function OwnItems({
  kind,
  resolution,
  onOpenItem,
}: {
  kind: 'subagents' | 'skills';
  resolution: AgentResolution;
  onOpenItem: (item: PackageItem) => void;
}) {
  const groups = resolution.plugins
    .map((plugin) => ({ plugin: plugin.id, items: packageItems(resolution, plugin.id)[kind] }))
    .filter((group) => group.items.length > 0);
  if (!groups.length)
    return (
      <StateView
        kind="empty"
        size="row"
        title={`This agent has no ${AGENT_USE_LABELS[kind].toLowerCase()}.`}
      />
    );
  return (
    <div className="grid min-w-0 gap-2">
      {groups.map((group) => (
        <ItemList key={group.plugin} label={bringsLabel(group.plugin, kind, group.items.length)}>
          <p className="truncate pb-0.5 text-caption text-faint">
            {bringsLabel(group.plugin, kind, group.items.length)}
          </p>
          {group.items.map((item) => (
            <PackageItemRow item={item} key={item.id} onOpen={onOpenItem} />
          ))}
        </ItemList>
      ))}
    </div>
  );
}
