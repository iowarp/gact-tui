import type { LanguageModelPreset } from '@clio/core/v3';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { LoadingFeedback } from './loading-feedback';
import {
  Cascader,
  CascaderList,
  CascaderPanel,
  CascaderStatus,
} from '@/components/reui/cascader/cascader';
import { CascaderColumns } from '@/components/reui/cascader/cascader-columns';
import { CascaderFooter } from '@/components/reui/cascader/cascader-footer';
import { CascaderNav } from '@/components/reui/cascader/cascader-nav';
import {
  CascaderVirtualColumn,
  CascaderVirtualItems,
} from '@/components/reui/cascader/cascader-virtual';
import type { CascaderNode } from '@/components/reui/cascader/cascader-types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useProgressiveModelCatalog } from './use-progressive-model-catalog';
import { useHiddenProviders } from '@/hooks/use-hidden-providers';
import type { ClioModelOption } from '@/lib/model-options';
import { cn } from '@/lib/utils';
import { modelTypeOf } from '@/lib/model-capability-tags';
import {
  DEFAULT_FILTER_TOKENS,
  addModelFilterToken,
  freeSearchText,
  surrogateChatReason,
  type ModelFilterToken,
} from '@/lib/model-filter-tokens';
import {
  modelNodeValue,
  PROVIDER_NODE_PREFIX,
  type PickerNodeData,
  providerGroupsFromOptions,
  providerNodeValue,
  type ProviderGroup,
} from './model-picker-model';
import { useProviderPanel } from './model-picker-provider-panel';
import { ModelPickerSearch } from './model-picker-search';
import { PickerRowLabel } from './model-picker-row-label';
import { useModelPickerTree } from './model-picker-tree';
import {
  ALCF_FAMILY_VALUE,
  ALCF_SERVERS,
  groupAlcfProviders,
  isAlcfServer,
} from './model-picker-provider-families';
import { ProviderFamilyRow } from './model-picker-provider-family-row';
import { useModelPickerFacets } from './use-model-picker-facets';
import { useModelPickerSearchView } from './use-model-picker-search-view';

interface ModelPickerCatalogProps {
  loading?: boolean;
  model?: string;
  onChange: (choice: ClioModelOption) => void;
  onClose: () => void;
  onOpenSettings: () => void;
  options: readonly ClioModelOption[];
  presets: readonly LanguageModelPreset[];
  provider?: string;
  showColumns: boolean;
  facetsOpen: boolean;
  setFacetsOpen: (open: boolean) => void;
  onProviderChange: (providerId: string | undefined) => void;
}

// The Cascader's own combobox keeps real DOM focus permanently on its search
// input (a virtual/roving-focus listbox -- see cascader-nav.tsx/cascader-item.tsx),
// so a real, independently-typeable <input> (the API-key field) can never sit
// INSIDE its tree as a node. The action panel instead renders as a `footer`
// inside the active (deepest) column's OWN box -- see `CascaderColumnPanel`'s
// `footer` prop -- never a separate full-width row below every column, which
// would leave a matching empty cell under the ones that don't have one. Each
// of the two levels (provider, model) gets an equal half of the panel.
const PICKER_COLUMN_WIDTH = 'calc(50% - .5px)';

/** Mount only when the open dialog is ready to prepare its catalog. */
export const ModelPickerCatalog = memo(function ModelPickerCatalog({
  loading = false,
  model,
  onChange,
  onClose,
  onOpenSettings,
  options,
  presets,
  provider,
  showColumns,
  facetsOpen,
  setFacetsOpen,
  onProviderChange,
}: ModelPickerCatalogProps) {
  const [query, setQuery] = useState('');
  // ONE state, ONE footer button (v15 ruling): "Hidden (N)" IS the manage
  // action. On: every row -- hidden or shown, configured or not -- appears,
  // and the eye toggle on each becomes interactive. Off: hidden providers
  // (and not-yet-configured presets) drop back out of the list.
  const [managingVisibility, setManagingVisibility] = useState(false);
  const { hiddenProviders, setProviderHidden, setProvidersHidden } = useHiddenProviders();
  const [alcfExpanded, setAlcfExpanded] = useState(() => isAlcfServer(provider));
  // ALCF's shared sign-in exposes four server destinations, including ones
  // whose catalog has not been checked yet. Other unconfigured presets stay
  // in visibility management until the service reports a catalog entry.
  const providers = useMemo(() => {
    const reported = new Set(options.map((option) => option.providerId));
    return providerGroupsFromOptions(options, presets, true).filter(
      (group) =>
        reported.has(group.id) ||
        isAlcfServer(group.id) ||
        (loading && presets.some((preset) => preset.id === group.id && preset.is_authenticated)),
    );
  }, [options, presets, loading]);
  const sortedProviders = useMemo(
    () => (managingVisibility ? providerGroupsFromOptions(options, presets, true) : providers),
    [managingVisibility, options, presets, providers],
  );
  const [path, setPath] = useState<string[]>(() => {
    const preferred = providers.find((item) => item.id === provider);
    return preferred ? [providerNodeValue(preferred.id)] : [];
  });
  const visibleProviders = useMemo(
    () => sortedProviders.filter((item) => managingVisibility || !hiddenProviders.has(item.id)),
    [hiddenProviders, sortedProviders, managingVisibility],
  );
  const presetsById = useMemo(
    () => new Map(presets.map((preset) => [preset.id, preset])),
    [presets],
  );
  const [tokens, setTokens] = useState<ModelFilterToken[]>(() => [...DEFAULT_FILTER_TOKENS]);
  const [notice, setNotice] = useState<string>();
  const activeGroup = sortedProviders.find((item) => providerNodeValue(item.id) === path[0]);
  const prepared = useProgressiveModelCatalog(visibleProviders, activeGroup?.id);
  const tree = useModelPickerTree(visibleProviders, tokens, prepared);
  const loadingModels =
    activeGroup && (!prepared.has(activeGroup.id) || (loading && !activeGroup.choices.length));
  const loadingPanel = (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading available models"
      className="space-y-3 p-3"
    >
      <p className="text-sm text-muted-foreground">Loading {activeGroup?.name} models…</p>
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-9 w-full" />
      ))}
    </div>
  );
  useEffect(() => onProviderChange(activeGroup?.id), [activeGroup?.id, onProviderChange]);
  // Provider rows live only at depth 0, and the tree is exactly two levels
  // (provider -> model), so once a provider is drilled into, the ROOT column
  // becomes the non-active column and the Cascader renders EVERY row in it as
  // a real `<button>` (see cascader-columns.tsx's `as={column.active ?
  // 'option' : 'button'}`). The eye toggle is itself a real `<button>`
  // (Toggle); nesting one inside the other is invalid HTML and a real DOM
  // warning, not a test artifact. `PickerRowLabel` renders the toggle as a
  // static (non-`<button>`) element for exactly this case.
  const providerRowsAreTrailButtons = showColumns && path.length > 0;
  const selectedChoice = options.find(
    (choice) => choice.available && choice.providerId === provider && choice.id === model,
  );
  const search = useModelPickerSearchView({
    providers: visibleProviders,
    entries: tree.entries,
    counts: tree.counts,
    total: tree.total,
    query,
  });
  const { toggleCollapsed, matchesText, searching } = search;
  const providerNodes = useMemo(
    () => (searching ? tree.nodes : groupAlcfProviders(tree.nodes, alcfExpanded)),
    [tree.nodes, alcfExpanded, searching],
  );
  const { facetTabs, maxInputPrice } = useModelPickerFacets(
    tree.entries,
    tokens,
    searching,
    matchesText,
  );
  // A press on a results group header drills in (the cascader's own branch
  // behaviour, which also clears the query); in search results it folds the
  // group instead, so the clear that follows is dropped.
  const keepQueryOnce = useRef(false);
  const activePreset = presetsById.get(activeGroup?.id ?? '');
  // The provider in view's right-hand panel: its setup state and
  // action row, from the SAME shared action hook every provider surface uses.
  const panel = useProviderPanel({
    group: activeGroup,
    preset: activePreset,
    open: true,
    notice,
    onClose: onOpenSettings,
  });
  const activeStage = panel.stage;

  function hideProvider(group: ProviderGroup): void {
    const nextHidden = setProviderHidden(group.id, true);
    const nextProvider = providers.find((item) => item.id !== group.id && !nextHidden.has(item.id));
    setPath(nextProvider ? [providerNodeValue(nextProvider.id)] : []);
  }

  function showProvider(group: ProviderGroup): void {
    setProviderHidden(group.id, false);
  }

  function toggleProviderVisibility(node: CascaderNode<PickerNodeData>): void {
    if (node.data?.kind === 'provider-family') {
      const ids = Object.keys(ALCF_SERVERS);
      const hide = !ids.every((id) => hiddenProviders.has(id));
      setProvidersHidden(ids, hide);
      if (hide && isAlcfServer(activeGroup?.id)) setPath([]);
      return;
    }
    if (node.data?.kind !== 'provider') return;
    const group = node.data.group;
    if (hiddenProviders.has(group.id)) showProvider(group);
    else hideProvider(group);
  }

  function handleQueryChange(nextQuery: string): void {
    if (keepQueryOnce.current) {
      keepQueryOnce.current = false;
      if (!nextQuery) return;
    }
    // A provider path is useful for browsing, but it turns deep search into a
    // search inside that provider and leaves the old provider pinned beside a
    // global hit. Start every new search at the root; choosing a result can
    // then establish the path that remains when the query is cleared.
    // A token being typed ("input:") is not a search: only free text is.
    if (freeSearchText(nextQuery) && !freeSearchText(query)) setPath([]);
    setQuery(nextQuery);
  }

  return (
    <Cascader
      closeOnSelect={false}
      indicator
      inline
      inputValue={query}
      items={providerNodes}
      labels={{
        actionsLabel: 'Provider actions',
        columnsLabel: 'Providers and models',
        empty: 'No available models',
        rootLevel: 'Providers',
      }}
      maxHeight="100%"
      mode={showColumns ? 'columns' : 'drill'}
      onInputValueChange={handleQueryChange}
      onPathChange={(nextPath, details) => {
        const header = nextPath.length === 1 ? nextPath[0] : undefined;
        if (header === ALCF_FAMILY_VALUE) {
          setAlcfExpanded(!alcfExpanded);
          if (alcfExpanded && isAlcfServer(activeGroup?.id)) setPath([]);
          return;
        }
        if (
          search.searching &&
          details.reason === 'drill' &&
          header?.startsWith(PROVIDER_NODE_PREFIX)
        ) {
          toggleCollapsed(header.slice(PROVIDER_NODE_PREFIX.length));
          keepQueryOnce.current = true;
          return;
        }
        setPath(nextPath);
        setNotice(undefined);
      }}
      onValueChange={(_value, details) => {
        if (details.node?.data?.kind !== 'model') return;
        const choice = details.node.data.choice;
        // A specialist model is a first-class row, but it cannot be the
        // chat model: say why instead of selecting it.
        if (choice.chatSelectable === false) {
          setNotice(surrogateChatReason(modelTypeOf(choice)));
          return;
        }
        onChange(choice);
        onClose();
      }}
      path={path}
      renderItem={(node) =>
        node.data?.kind === 'provider-family' ? (
          <ProviderFamilyRow
            data={node.data}
            hidden={Object.keys(ALCF_SERVERS).every((id) => hiddenProviders.has(id))}
            eyeAsStaticElement={providerRowsAreTrailButtons}
            onToggleVisibility={
              managingVisibility ? () => toggleProviderVisibility(node) : undefined
            }
          />
        ) : undefined
      }
      renderLabel={(node, state) => (
        <PickerRowLabel
          stage={
            node.data?.kind === 'provider' && node.data.group.id === activeGroup?.id
              ? activeStage
              : undefined
          }
          eyeAsStaticElement={providerRowsAreTrailButtons}
          filterCount={
            node.data?.kind === 'provider' && prepared.has(node.data.group.id)
              ? tree.counts.get(node.data.group.id)
              : undefined
          }
          search={
            search.searching && node.data?.kind === 'provider'
              ? {
                  count: search.counts.get(node.data.group.id) ?? { matches: 0, total: 0 },
                  collapsed: search.collapsed.has(node.data.group.id),
                }
              : undefined
          }
          onTagToken={(token) => setTokens((current) => addModelFilterToken(current, token))}
          hidden={node.data?.kind === 'provider' && hiddenProviders.has(node.data.group.id)}
          managingVisibility={managingVisibility}
          node={node}
          onToggleVisibility={
            managingVisibility && node.data?.kind === 'provider'
              ? () => toggleProviderVisibility(node)
              : undefined
          }
          state={state}
        />
      )}
      filter={search.filter}
      // Nothing chosen yet: keep the path the picker opened on.
      revealSelected={Boolean(selectedChoice)}
      searchScope={freeSearchText(query) ? 'deep' : 'level'}
      // Every hit is listed (the lists are windowed): the counts beside the
      // search and each provider must agree with the rows.
      searchLimit={Number.POSITIVE_INFINITY}
      selectable={(node) => node.data?.kind === 'model'}
      // Always controlled: a refused pick (a surrogate) must not stay checked.
      value={selectedChoice ? modelNodeValue(selectedChoice) : ''}
    >
      <CascaderPanel
        className={cn(
          'h-full min-h-0',
          // Search results: a provider row is a group header that draws
          // its own "matches / total" and fold chevron.
          search.searching && '[&_[data-slot=cascader-item-trailing]]:hidden',
        )}
      >
        <CascaderNav>
          <div className="flex w-full min-w-0 items-center gap-1 pe-8">
            <ModelPickerSearch
              availableTokens={tree.availableTokens}
              onQueryChange={handleQueryChange}
              facetTabs={facetTabs}
              facetsOpen={facetsOpen}
              maxInputPrice={maxInputPrice}
              onFacetsOpenChange={setFacetsOpen}
              onTokensChange={setTokens}
              query={query}
              shown={search.matches}
              tokens={tokens}
              total={search.total}
            />
          </div>
        </CascaderNav>
        {/* A live provider can report hundreds of models, and every row
                  carries an icon, a description and a health indicator. Both
                  layouts render through the windowed items, which fall back to
                  the plain rows below the cascader's own threshold. The active
                  provider's action UI (see `activeProviderActionsContent`
                  above) lands as the active column's own `footer` in columns
                  mode, or directly below the single list in drill mode --
                  never a separate full-width row that would leave a dead cell
                  under a column that has nothing to show. */}
        {showColumns ? (
          <CascaderColumns
            className="w-full flex-1"
            columnWidth={PICKER_COLUMN_WIDTH}
            maxHeight="100%"
          >
            {(column) => {
              const providerColumn =
                column.active &&
                activeGroup !== undefined &&
                column.parent?.value === providerNodeValue(activeGroup.id);
              return (
                <CascaderVirtualColumn
                  column={column}
                  empty={
                    providerColumn ? (loadingModels ? loadingPanel : panel.column.empty) : undefined
                  }
                  footer={providerColumn ? panel.column.footer : undefined}
                  key={column.depth}
                />
              );
            }}
          </CascaderColumns>
        ) : (
          <>
            <CascaderList className="w-full flex-1" maxHeight="100%">
              <CascaderVirtualItems />
            </CascaderList>
            {path.length ? (
              <>
                {loadingModels ? loadingPanel : panel.column.empty}
                {panel.column.footer}
              </>
            ) : null}
          </>
        )}
        <CascaderFooter className="min-h-11 flex-row items-center justify-between gap-1 px-2">
          {loading || prepared.size < visibleProviders.length ? (
            <LoadingFeedback label={loading ? 'Refreshing models…' : 'Loading remaining models…'} />
          ) : null}
          <div className="flex min-w-0 items-center gap-1">
            <Button
              aria-pressed={managingVisibility}
              data-slot="provider-visibility-mode"
              onClick={() => setManagingVisibility((current) => !current)}
              size="sm"
              type="button"
              variant={managingVisibility ? 'secondary' : 'ghost'}
            >
              {managingVisibility ? (
                <EyeOffIcon data-icon="inline-start" />
              ) : (
                <EyeIcon data-icon="inline-start" />
              )}
              {managingVisibility ? 'Done' : `Hidden (${hiddenProviders.size})`}
            </Button>
          </div>
          {search.emptyProviders ? (
            <span
              className="truncate text-xs text-muted-foreground"
              data-slot="providers-without-matches"
            >
              {search.emptyProviders} {search.emptyProviders === 1 ? 'provider' : 'providers'} with
              no matches
            </span>
          ) : null}
        </CascaderFooter>
        <CascaderStatus />
      </CascaderPanel>
    </Cascader>
  );
});
