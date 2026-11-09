import { ChevronDownIcon } from 'lucide-react';
import type { CascaderItemState } from '@/components/reui/cascader/cascader-context';
import type { CascaderNode } from '@/components/reui/cascader/cascader-types';
import { displayedTags } from '@/lib/model-capability-tags';
import { cachedModelFacts } from './model-picker-fact-cache';
import type { ModelFilterToken } from '@/lib/model-filter-tokens';
import { cn } from '@/lib/utils';
import { KeyCap } from './primitives/key-chip';
import { ModelRowFacts } from './model-row-facts';
import { ModelDescriptionHint } from './model-description-hint';
import { providerGroupStatus, providerRunning, type PickerNodeData } from './model-picker-model';
import type { ProviderFilterCount } from './model-picker-tree';
import { ProviderEyeToggle } from './provider-eye-toggle';
import { ProviderHeartbeat } from './provider-heartbeat';
import { providerActionStageWord } from './provider-action-flows';
import type { ProviderSearchCount } from './use-model-picker-search-view';

interface PickerRowLabelProps {
  eyeAsStaticElement: boolean;
  /** Set while filter tokens hide some of this provider's models. */
  filterCount?: ProviderFilterCount;
  /**
   * Set while free text is searched: this provider row is a results GROUP
   * header -- "matches / total" and a fold chevron, which pressing the row
   * turns (the picker folds the group rather than drilling in).
   */
  search?: { count: ProviderSearchCount; collapsed: boolean };
  /** Clicking a row's tag adds its filter token. */
  onTagToken: (token: ModelFilterToken) => void;
  hidden: boolean;
  managingVisibility: boolean;
  node: CascaderNode<PickerNodeData>;
  onToggleVisibility?: () => void;
  /** The running action's stage for THIS provider: the heartbeat turns yellow. */
  stage?: string;
  state: CascaderItemState<PickerNodeData>;
}

function CountLabel({ shown, total, verb }: { shown: number; total: number; verb: string }) {
  return (
    <span
      aria-label={`${shown} of ${total} models ${verb}`}
      className="shrink-0 text-xs text-muted-foreground tabular-nums"
      data-slot="provider-filter-count"
    >
      {shown} / {total}
    </span>
  );
}

/**
 * One picker row's label. A provider row is the owner's template -- `name
 * heartbeat count ›` -- with the eye only while managing visibility; during a
 * search it becomes its results group's header (`name heartbeat 11 / 458 ⌄`).
 * A model row is one line: its name, then its facts (context, price and
 * capability icons, each adding its filter token when clicked) at the end.
 */
export function PickerRowLabel({
  eyeAsStaticElement,
  filterCount,
  search,
  onTagToken,
  hidden,
  managingVisibility,
  node,
  onToggleVisibility,
  stage,
  state,
}: PickerRowLabelProps) {
  if (node.data?.kind === 'provider') {
    // The model count and the drill chevron are the Cascader's own trailing
    // slots and render after this label -- except in search results, where
    // the picker hides them and this label draws the group's own.
    return (
      <span
        className="flex w-full min-w-0 items-center gap-1.5"
        data-collapsed={search?.collapsed ? '' : undefined}
      >
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-start',
            !providerRunning(node.data.group) && !stage && 'text-muted-foreground',
          )}
        >
          {node.label}
        </span>
        {!providerRunning(node.data.group) && !stage ? (
          <span
            className={cn(
              'shrink-0 text-[11px]',
              node.data.group.health === 'unavailable' || node.data.group.health === 'degraded'
                ? 'text-destructive'
                : 'text-muted-foreground',
            )}
            data-slot="provider-row-status"
            title={node.data.group.detail}
          >
            {providerGroupStatus(node.data.group).label}
          </span>
        ) : stage ? (
          <span
            className="shrink-0 text-[11px] text-muted-foreground"
            data-slot="provider-row-status"
            title={stage}
          >
            {providerActionStageWord(stage)}
          </span>
        ) : null}
        {managingVisibility && onToggleVisibility ? (
          <ProviderEyeToggle
            asStaticElement={eyeAsStaticElement}
            group={node.data.group}
            hidden={hidden}
            onToggle={onToggleVisibility}
          />
        ) : null}
        <ProviderHeartbeat group={node.data.group} stage={stage} />
        {search ? (
          <>
            <CountLabel shown={search.count.matches} total={search.count.total} verb="match" />
            <ChevronDownIcon
              aria-hidden="true"
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none',
                search.collapsed && '-rotate-90 rtl:rotate-90',
              )}
              data-slot="provider-group-chevron"
            />
            <span className="sr-only">{search.collapsed ? 'Collapsed' : 'Expanded'}</span>
          </>
        ) : filterCount && filterCount.shown !== filterCount.total ? (
          <CountLabel shown={filterCount.shown} total={filterCount.total} verb="shown" />
        ) : null}
      </span>
    );
  }
  const choice = node.data?.kind === 'model' ? node.data.choice : undefined;
  const facts = choice ? cachedModelFacts(choice) : undefined;
  const allTags = facts?.tags ?? [];
  // A router's name does not say what it routes to: its description does.
  const router = allTags.some((tag) => tag.axis === 'kind' && tag.value === 'router');
  const description = router ? facts?.facts.description : undefined;
  return (
    <span className="flex w-full min-w-0 flex-1 items-center gap-2">
      <span
        className={cn('min-w-0 truncate text-start', state.selected && 'font-medium')}
        data-slot="model-row-name"
      >
        {node.label}
      </span>
      {description ? <ModelDescriptionHint description={description} name={node.label} /> : null}
      <ModelRowFacts
        className="ms-auto"
        contextWindow={facts?.facts.contextWindow}
        inputPrice={facts?.facts.inputPrice}
        onTagToken={onTagToken}
        tags={displayedTags(allTags)}
      />
      <KeyCap className="hidden h-[18px] min-w-[18px] px-1 text-[10px] in-data-highlighted:inline-flex">
        ↵
      </KeyCap>
    </span>
  );
}
