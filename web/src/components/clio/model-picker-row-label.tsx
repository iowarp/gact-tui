import { ChevronDownIcon } from 'lucide-react';
import type { CascaderItemState } from '@/components/reui/cascader/cascader-context';
import type { CascaderNode } from '@/components/reui/cascader/cascader-types';
import { displayedTags, modelCapabilityTagsFromOption } from '@/lib/model-capability-tags';
import { tagFilterToken, type ModelFilterToken } from '@/lib/model-filter-tokens';
import { cn } from '@/lib/utils';
import { ModelCapabilityTags } from './model-capability-tags';
import type { PickerNodeData } from './model-picker-model';
import type { ProviderFilterCount } from './model-picker-tree';
import { ProviderEyeToggle } from './provider-eye-toggle';
import { ProviderHeartbeat } from './provider-heartbeat';
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
 * A model row is its name over its capability chips, each chip adding its
 * filter token when clicked.
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
}: PickerRowLabelProps) {
  if (node.data?.kind === 'provider') {
    // The model count and the drill chevron are the Cascader's own trailing
    // slots and render after this label -- except in search results, where
    // the picker hides them and this label draws the group's own.
    return (
      <span className="flex w-full min-w-0 items-center gap-1.5" data-collapsed={search?.collapsed ? '' : undefined}>
        <span className="min-w-0 flex-1 truncate text-start font-medium">{node.label}</span>
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
  const tags = choice ? displayedTags(modelCapabilityTagsFromOption(choice)) : [];
  return (
    <span className="flex min-w-0 flex-1 flex-col items-start gap-1 py-0.5">
      <span className="w-full truncate text-start" data-slot="model-row-name">
        {node.label}
      </span>
      <ModelCapabilityTags
        onTagClick={(tag) => {
          const token = tagFilterToken(tag);
          if (token) onTagToken(token);
        }}
        size="sm"
        tags={tags}
      />
    </span>
  );
}
