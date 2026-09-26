import { useMemo } from 'react';
import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import type { CascaderNode } from '@/components/reui/cascader/cascader-types';
import { IconTile } from '@/components/reui/icon-tile';
import { modelCapabilityTagsFromOption, type ModelCapabilityTag } from '@/lib/model-capability-tags';
import {
  matchesFilterTokens,
  modelFilterTokens,
  providerFilterToken,
  type ModelFilterToken,
} from '@/lib/model-filter-tokens';
import type { ClioModelOption } from '@/lib/model-options';
import { providerLogoId } from '@/lib/provider-presentation';
import {
  modelNodeValue,
  providerNodeValue,
  providerSearchDescription,
  type PickerNodeData,
  type ProviderGroup,
} from './model-picker-model';
import { providerColumnModels } from './model-picker-provider-panel';

/** How many of a provider's models the filter tokens leave, of how many. */
export interface ProviderFilterCount {
  shown: number;
  total: number;
}

/** One model a provider lists, with the tags and filter tokens it carries. */
export interface PickerModelEntry {
  group: ProviderGroup;
  choice: ClioModelOption;
  /** Its tree row (the same object the cascader indexes). */
  node: CascaderNode<PickerNodeData>;
  tags: readonly ModelCapabilityTag[];
  tokens: ReadonlySet<ModelFilterToken>;
  /** Whether the active filter tokens keep it. */
  kept: boolean;
}

/** OpenRouter's free router leads its list; everything else keeps its order. */
function pinFreeRouter(models: readonly ClioModelOption[]): ClioModelOption[] {
  const pinned = models.filter((model) => model.id === 'openrouter/free');
  return pinned.length ? [...pinned, ...models.filter((model) => model.id !== 'openrouter/free')] : [...models];
}

/**
 * The picker's provider -> model tree, filtered by the active tokens (AND):
 * each provider keeps only the models carrying every token, with its own
 * "shown / total" count, and the totals across every listed provider. Every
 * listed model (kept or not) is also returned as an entry, which the search
 * counts and the filter panel read. The free-text query is applied by the
 * cascader's own deep search on top.
 */
export function useModelPickerTree(
  providers: readonly ProviderGroup[],
  tokens: readonly ModelFilterToken[],
) {
  const tokensByOption = useMemo(() => {
    const map = new Map<ClioModelOption, { tags: ModelCapabilityTag[]; tokens: Set<ModelFilterToken> }>();
    for (const group of providers) {
      for (const choice of group.choices) {
        const tags = modelCapabilityTagsFromOption(choice);
        const carried = modelFilterTokens(tags, { chatSelectable: choice.chatSelectable !== false });
        carried.add(providerFilterToken(choice.providerId));
        map.set(choice, { tags, tokens: carried });
      }
    }
    return map;
  }, [providers]);

  return useMemo(() => {
    const counts = new Map<string, ProviderFilterCount>();
    const availableTokens = new Set<ModelFilterToken>();
    const entries: PickerModelEntry[] = [];
    const nodes: CascaderNode<PickerNodeData>[] = providers.map((group) => {
      const models = pinFreeRouter(providerColumnModels(group));
      const children: CascaderNode<PickerNodeData>[] = [];
      for (const choice of models) {
        const carried = tokensByOption.get(choice) ?? { tags: [], tokens: new Set<ModelFilterToken>() };
        for (const token of carried.tokens) availableTokens.add(token);
        const node: CascaderNode<PickerNodeData> = {
          value: modelNodeValue(choice),
          label: choice.label,
          description: choice.description,
          keywords: [choice.id, choice.providerId, choice.providerName],
          data: { kind: 'model', choice },
        };
        const kept = matchesFilterTokens(carried.tokens, tokens);
        if (kept) children.push(node);
        entries.push({ group, choice, node, tags: carried.tags, tokens: carried.tokens, kept });
      }
      counts.set(group.id, { shown: children.length, total: models.length });
      return {
        value: providerNodeValue(group.id),
        label: group.name,
        description: providerSearchDescription(group),
        icon: (
          <IconTile aria-hidden="true" size="sm" variant="outline">
            <ModelSelectorLogo className="size-5" provider={providerLogoId(group.id)} />
          </IconTile>
        ),
        hasChildren: true,
        // A count means "this many usable models" (a provider whose latest
        // check failed shows none). While filters hide some, the row shows
        // "shown / total" itself instead (a 0 count renders nothing).
        count: children.length === models.length ? models.length : 0,
        keywords: [
          group.id,
          group.endpoint ?? '',
          group.detail ?? '',
          ...group.choices.flatMap((choice) => [choice.id, choice.label]),
        ],
        data: { kind: 'provider', group },
        children,
      };
    });
    const all = [...counts.values()];
    const shown = all.reduce((sum, count) => sum + count.shown, 0);
    const total = all.reduce((sum, count) => sum + count.total, 0);
    return { nodes, counts, availableTokens, entries, shown, total };
  }, [providers, tokens, tokensByOption]);
}
