import { CheckIcon, ChevronDownIcon } from 'lucide-react';
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
  search?: {
    count: ProviderSearchCount;
    collapsed: boolean;
    /** A narrow picker's group header with no search typed: "OpenRouter 3". */
    plain?: boolean;
  };
  /** Clicking a row's tag adds its filter token. */
  onTagToken: (token: ModelFilterToken) => void;
  hidden: boolean;
  managingVisibility: boolean;
  node: CascaderNode<PickerNodeData>;
  onToggleVisibility?: () => void;
  /** The running action's stage for THIS provider: the heartbeat turns yellow. */
  stage?: string;
  /**
   * One column: a model's name sits on the group label's edge, with the ✓
   * leading only the chosen row (no reserved check slot).
   */
  flush?: boolean;
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
  flush = false,
  state,
}: PickerRowLabelProps) {
  if (node.data?.kind === 'provider-more') {
    // A truncated group's last model row: "309 more", opened with → or ↵.
    return (
      <span className="flex w-full min-w-0 items-center gap-2" data-slot="provider-more">
        <span className="min-w-0 truncate text-start text-muted-foreground">{node.label}</span>
        <span className="ms-auto hidden items-center gap-1 in-data-highlighted:inline-flex">
          <KeyCap className="h-[18px] min-w-[18px] px-1 text-[10px]">→</KeyCap>
          <KeyCap className="h-[18px] min-w-[18px] px-1 text-[10px]">↵</KeyCap>
        </span>
      </span>
    );
  }
  if (node.data?.kind === 'provider' && search?.plain) {
    // One column: a small muted group label with only its count; its manage
    // row (status and actions) ends the group. Pressing it folds the group.
    return (
      <span
        className="flex w-full min-w-0 items-center gap-[7px] text-[11px] font-semibold text-muted-foreground"
        data-collapsed={search.collapsed ? '' : undefined}
        data-slot="provider-group-header"
      >
        <span className="min-w-0 flex-1 truncate text-start">{node.label}</span>
        <span
          aria-label={`${search.count.matches} models`}
          className="shrink-0 font-mono text-[10.5px] font-normal text-faint tabular-nums"
          data-slot="provider-filter-count"
        >
          {search.count.matches || null}
        </span>
        <span className="sr-only">{search.collapsed ? 'Collapsed' : 'Expanded'}</span>
      </span>
    );
  }
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
            className="shrink-0 text-[11px] text-muted-foreground"
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
      {/* The spec's ✓ leads the row; in columns every model keeps the slot so names align. */}
      {flush && !state.selected ? null : (
        <span aria-hidden="true" className="grid w-3.5 shrink-0 place-items-center">
          {state.selected ? <CheckIcon className="size-3.5 text-accent-foreground" /> : null}
        </span>
      )}
      <span
        className={cn(
          'min-w-0 truncate text-start font-normal',
          state.selected && 'text-accent-foreground',
        )}
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
      <KeyCap size="row" className="hidden in-data-highlighted:inline-flex">
        ↵
      </KeyCap>
    </span>
  );
}
