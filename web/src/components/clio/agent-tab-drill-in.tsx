import type { AgentDelta, AgentResolution, PluginEntry, PromptBasis } from '@clio/core/v3';
import { ArrowLeftIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { AddIcon } from '@/lib/icon-vocabulary';
import { AgentPluginMenu } from './agent-plugin-menu';
import { AgentPluginTree } from './agent-plugin-tree';
import { AGENT_USE_FILTERS, AGENT_USE_LABELS, type AgentUseKind } from './agent-tab-values';
import { ComposedPromptView } from './composed-prompt-view';
import { IconButton } from './primitives/icon-button';
import { focusQuietly } from './primitives/quiet-focus';

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
}: AgentDrillInProps) {
  const title = AGENT_USE_LABELS[kind];
  const back = useRef<HTMLButtonElement>(null);
  // Arriving keeps focus on Back without its name covering the view.
  useEffect(() => focusQuietly(back.current), []);
  return (
    <section aria-label={title} className="flex min-w-0 flex-col">
      <div className="flex min-h-10 min-w-0 items-center gap-2 border-b border-border px-2.5 py-1.5 text-[12px] whitespace-nowrap">
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
        )}
      </div>
    </section>
  );
}
