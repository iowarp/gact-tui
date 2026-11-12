import { LayoutGridIcon } from 'lucide-react';
import { useMemo } from 'react';
import type { CascaderNode } from '@/components/reui/cascader/cascader-types';
import {
  MANAGE_NODE_PREFIX,
  MODEL_NODE_PREFIX,
  MORE_NODE_PREFIX,
  type PickerNodeData,
  type ProviderGroup,
  SEARCH_ALL_VALUE,
  SEARCH_HEADER_PREFIX,
  SEARCH_RESULT_PREFIX,
} from './model-picker-model';
import { groupAlcfProviders } from './model-picker-provider-families';
import type { ProviderSearchCount } from './use-model-picker-search-view';

/** One column: models a provider's group lists before its "N more" row. */
const GROUP_PREVIEW = 3;

interface PickerNodesInput {
  /** The filtered provider → model tree. */
  nodes: CascaderNode<PickerNodeData>[];
  /** One column: providers are group headers over their models. */
  grouped: boolean;
  /** Free text is typed. */
  searching: boolean;
  /** Two columns with search typed: "All providers" leads the providers column. */
  searchColumns: boolean;
  /** Provider groups the person folded. */
  collapsed: ReadonlySet<string>;
  /** Groups whose "N more" row was opened. */
  openGroups: ReadonlySet<string>;
  alcfExpanded: boolean;
  /** `provider:model` of the chosen model, or empty. */
  chosenKey: string;
  /** Search model node values that match. */
  matched: ReadonlySet<string>;
  searchCounts: ReadonlyMap<string, ProviderSearchCount>;
  searchMatches: number;
}

/**
 * The cascader items the picker lists: two columns of providers then models,
 * one grouped list of provider headers over a preview of their models, or, with
 * search typed in two columns, "All providers" over every match by provider.
 */
export function useModelPickerNodes({
  nodes,
  grouped,
  searching,
  searchColumns,
  collapsed,
  openGroups,
  alcfExpanded,
  chosenKey,
  matched,
  searchCounts,
  searchMatches,
}: PickerNodesInput): CascaderNode<PickerNodeData>[] {
  const providerNodes = useMemo(() => {
    if (grouped) {
      // One flat list: each provider's header, then its models and the manage
      // row that ends the group (the provider bar, folded), unless folded.
      return nodes.flatMap((node): CascaderNode<PickerNodeData>[] => {
        const { children, ...header } = node;
        const group = node.data?.kind === 'provider' ? node.data.group : undefined;
        const open = !group || !collapsed.has(group.id);
        if (!open) return [{ ...header, hasChildren: true }];
        const manage: CascaderNode<PickerNodeData>[] =
          group && !searching
            ? [
                {
                  value: MANAGE_NODE_PREFIX + group.id,
                  label: `Manage ${group.name}`,
                  static: true,
                  data: { kind: 'provider-manage', group },
                },
              ]
            : [];
        return [
          { ...header, hasChildren: true },
          ...previewModels(
            children ?? [],
            group,
            searching || openGroups.has(group?.id ?? ''),
            chosenKey,
          ),
          ...manage,
        ];
      });
    }
    return searching ? nodes : groupAlcfProviders(nodes, alcfExpanded);
  }, [grouped, nodes, alcfExpanded, searching, collapsed, openGroups, chosenKey]);
  return useMemo(() => {
    if (!searchColumns) return providerNodes;
    const results = nodes.flatMap((node): CascaderNode<PickerNodeData>[] => {
      if (node.data?.kind !== 'provider') return [];
      const group = node.data.group;
      const models = (node.children ?? []).filter((child) => matched.has(child.value));
      if (!models.length) return [];
      const count = searchCounts.get(group.id);
      return [
        {
          value: SEARCH_HEADER_PREFIX + group.id,
          label: group.name,
          icon: node.icon,
          static: true,
          data: {
            kind: 'search-header',
            group,
            matches: count?.matches ?? models.length,
            total: count?.total ?? models.length,
          },
        },
        ...models.map((child) => ({ ...child, value: SEARCH_RESULT_PREFIX + child.value })),
      ];
    });
    const all: CascaderNode<PickerNodeData> = {
      value: SEARCH_ALL_VALUE,
      label: 'All providers',
      icon: <LayoutGridIcon aria-hidden="true" />,
      hasChildren: true,
      children: results,
      data: { kind: 'search-all', matches: searchMatches },
    };
    return [all, ...providerNodes];
  }, [searchColumns, providerNodes, nodes, matched, searchCounts, searchMatches]);
}

/**
 * A provider's first models in one column, the chosen one always among them,
 * then a dim "N more" row that opens the rest (all of them while searching).
 */
function previewModels(
  children: CascaderNode<PickerNodeData>[],
  group: ProviderGroup | undefined,
  all: boolean,
  /** `provider:model` of the chosen model, or empty. */
  chosenKey: string,
): CascaderNode<PickerNodeData>[] {
  if (all || !group || children.length <= GROUP_PREVIEW + 1) return children;
  let shown = children.slice(0, GROUP_PREVIEW);
  const chosen = chosenKey
    ? children.findIndex((child) => child.value === MODEL_NODE_PREFIX + chosenKey)
    : -1;
  if (chosen >= GROUP_PREVIEW) shown = [...shown.slice(0, -1), children[chosen]!];
  const hidden = children.length - shown.length;
  return [
    ...shown,
    {
      value: MORE_NODE_PREFIX + group.id,
      label: `${hidden} more`,
      hasChildren: true,
      data: { kind: 'provider-more', group, hidden },
    },
  ];
}
