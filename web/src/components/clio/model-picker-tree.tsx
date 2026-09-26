import { useMemo } from 'react';
import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import type { CascaderNode } from '@/components/reui/cascader/cascader-types';
import { IconTile } from '@/components/reui/icon-tile';
import { modelCapabilityTagsFromOption } from '@/lib/model-capability-tags';
import {
  matchesFilterTokens,
  modelFilterTokens,
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

/** OpenRouter's free router leads its list; everything else keeps its order. */
function pinFreeRouter(models: readonly ClioModelOption[]): ClioModelOption[] {
  const pinned = models.filter((model) => model.id === 'openrouter/free');
  return pinned.length ? [...pinned, ...models.filter((model) => model.id !== 'openrouter/free')] : [...models];
}

/**
 * The picker's provider -> model tree, filtered by the active tokens (AND):
 * each provider keeps only the models carrying every token, with its own
 * "shown / total" count, and the totals across every listed provider. The
 * free-text query is applied by the cascader's own deep search on top.
 */
export function useModelPickerTree(
  providers: readonly ProviderGroup[],
  tokens: readonly ModelFilterToken[],
) {
  const tokensByOption = useMemo(() => {
    const map = new Map<ClioModelOption, Set<ModelFilterToken>>();
    for (const group of providers) {
      for (const choice of group.choices) {
        map.set(choice, modelFilterTokens(modelCapabilityTagsFromOption(choice)));
      }
    }
    return map;
  }, [providers]);

  return useMemo(() => {
    const counts = new Map<string, ProviderFilterCount>();
    const availableTokens = new Set<ModelFilterToken>();
    const nodes: CascaderNode<PickerNodeData>[] = providers.map((group) => {
      const models = pinFreeRouter(providerColumnModels(group));
      const kept = models.filter((choice) => {
        const carried = tokensByOption.get(choice) ?? new Set<ModelFilterToken>();
        for (const token of carried) availableTokens.add(token);
        return matchesFilterTokens(carried, tokens);
      });
      counts.set(group.id, { shown: kept.length, total: models.length });
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
        count: kept.length === models.length ? models.length : 0,
        keywords: [
          group.id,
          group.endpoint ?? '',
          group.detail ?? '',
          ...group.choices.flatMap((choice) => [choice.id, choice.label]),
        ],
        data: { kind: 'provider', group },
        children: kept.map(
          (choice): CascaderNode<PickerNodeData> => ({
            value: modelNodeValue(choice),
            label: choice.label,
            description: choice.description,
            keywords: [choice.id, choice.providerId, choice.providerName],
            data: { kind: 'model', choice },
          }),
        ),
      };
    });
    const all = [...counts.values()];
    const shown = all.reduce((sum, count) => sum + count.shown, 0);
    const total = all.reduce((sum, count) => sum + count.total, 0);
    return { nodes, counts, availableTokens, shown, total };
  }, [providers, tokens, tokensByOption]);
}
