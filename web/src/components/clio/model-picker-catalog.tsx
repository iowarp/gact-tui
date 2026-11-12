import type { LanguageModelPreset } from '@clio/core/v3';
import { EyeIcon, EyeOffIcon, LayoutGridIcon } from 'lucide-react';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { LoadingFeedback } from './loading-feedback';
import { NamedTooltip } from './primitives/icon-button';
import { PickerFooter, type PickerHint } from './primitives/picker-footer';
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
  MANAGE_NODE_PREFIX,
  MODEL_NODE_PREFIX,
  MORE_NODE_PREFIX,
  modelNodeValue,
  PROVIDER_NODE_PREFIX,
  type PickerNodeData,
  providerGroupsFromOptions,
  providerNodeValue,
  type ProviderGroup,
  SEARCH_ALL_VALUE,
  SEARCH_HEADER_PREFIX,
  SEARCH_RESULT_PREFIX,
  type SearchHeaderNodeData,
} from './model-picker-model';
import { useProviderPanel } from './model-picker-provider-panel';
import { ModelPickerHighlightSeed } from './model-picker-highlight-seed';
import { ProviderManageRow } from './model-picker-manage-row';
import { ModelPickerSearch } from './model-picker-search';
import { ModelPickerNoMatch } from './model-picker-no-match';
import { quickFilters } from '@/lib/model-quick-filters';
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
import { useProviderInstallStages } from './provider-install-jobs';
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
  /** The narrowest picker: row 2's chips fold into the Filters button. */
  foldFilters?: boolean;
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
const EMPTY_PATH: string[] = [];

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
  foldFilters = false,
  facetsOpen,
  setFacetsOpen,
  onProviderChange,
}: ModelPickerCatalogProps) {
  const [query, setQuery] = useState('');
  // ONE state, ONE footer button (v15 ruling): "Hidden N" IS the manage
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
  // Narrow (one column): the providers are group headers over their models,
  // so the provider in view is the header last pressed, else the chosen one.
  const [focusProviderId, setFocusProviderId] = useState<string>();
  const grouped = !showColumns;
  const activeGroup = grouped
    ? sortedProviders.find((item) => item.id === (focusProviderId ?? provider))
    : path[0] === SEARCH_ALL_VALUE
      ? // Every match is in view: the provider bar stays on the chosen provider.
        sortedProviders.find((item) => item.id === provider)
      : sortedProviders.find((item) => providerNodeValue(item.id) === path[0]);
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
  // One column lists a few of each provider's models, then "N more" opens the rest.
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(() => new Set());
  const providerNodes = useMemo(() => {
    if (grouped) {
      // One flat list: each provider's header, then its models and the manage
      // row that ends the group (the provider bar, folded), unless folded.
      return tree.nodes.flatMap((node): CascaderNode<PickerNodeData>[] => {
        const { children, ...header } = node;
        const group = node.data?.kind === 'provider' ? node.data.group : undefined;
        const open = !group || !search.collapsed.has(group.id);
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
            provider && model ? `${provider}:${model}` : '',
          ),
          ...manage,
        ];
      });
    }
    return searching ? tree.nodes : groupAlcfProviders(tree.nodes, alcfExpanded);
  }, [grouped, tree.nodes, alcfExpanded, searching, search.collapsed, openGroups, provider, model]);
  // Two columns, search typed: "All providers" leads the providers column and
  // opens every match grouped under its provider; a provider row narrows to its own.
  const searchColumns = showColumns && searching;
  const { matched, counts: searchCounts, matches: searchMatches } = search;
  const columnNodes = useMemo(() => {
    if (!searchColumns) return providerNodes;
    const results = tree.nodes.flatMap((node): CascaderNode<PickerNodeData>[] => {
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
  }, [searchColumns, providerNodes, tree.nodes, matched, searchCounts, searchMatches]);
  const searchFilter = search.filter;
  const filter = useCallback(
    (node: CascaderNode<PickerNodeData>, normalizedQuery: string) =>
      node.data?.kind === 'search-all' ||
      node.data?.kind === 'search-header' ||
      node.value.startsWith(SEARCH_RESULT_PREFIX) ||
      searchFilter(node, normalizedQuery),
    [searchFilter],
  );
  const { facetTabs, maxInputPrice, hasSizes } = useModelPickerFacets(
    tree.entries,
    tokens,
    searching,
    matchesText,
  );
  // Every provider searched and none matched: say why and offer the way out.
  const noMatch =
    searching && search.matches === 0 && !loading && prepared.size >= visibleProviders.length;
  const noMatchFilters = useMemo(
    () => (noMatch ? quickFilters(facetTabs, tokens, maxInputPrice !== undefined, hasSizes) : []),
    [noMatch, facetTabs, tokens, maxInputPrice, hasSizes],
  );
  const noMatchPanel = noMatch ? (
    <ModelPickerNoMatch
      entries={tree.entries}
      keyboard={!facetsOpen}
      onQueryChange={handleQueryChange}
      onTokensChange={setTokens}
      query={query}
      quickFilters={noMatchFilters}
      quietTokens={DEFAULT_FILTER_TOKENS}
      tokens={tokens}
    />
  ) : null;
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
  // Installs keep running on the agent while another provider is in view.
  const installStages = useProviderInstallStages();

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
    // Two columns open the search on "All providers"; clearing it goes back
    // to the provider in view (or the chosen one).
    const wasSearching = Boolean(freeSearchText(query));
    const willSearch = Boolean(freeSearchText(nextQuery));
    if (willSearch && !wasSearching) setPath(showColumns ? [SEARCH_ALL_VALUE] : []);
    if (!willSearch && wasSearching && showColumns) {
      const back = path[0]?.startsWith(PROVIDER_NODE_PREFIX) ? path[0] : undefined;
      const chosen = providers.find((item) => item.id === provider);
      setPath(back ? [back] : chosen ? [providerNodeValue(chosen.id)] : []);
    }
    setQuery(nextQuery);
  }

  // The grouped list draws provider headers as fold toggles, but the
  // cascader's level keys drill (= toggle) any branch. Tree keys instead:
  // forward on an open group goes to its first model, back folds it.
  function handleGroupLevelKey(event: ReactKeyboardEvent<HTMLDivElement>): void {
    const field = event.target;
    if (
      facetsOpen ||
      !(field instanceof HTMLInputElement) ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }
    const rtl = getComputedStyle(field).direction === 'rtl';
    const forward = event.key === (rtl ? 'ArrowLeft' : 'ArrowRight');
    const back = event.key === (rtl ? 'ArrowRight' : 'ArrowLeft');
    if (!forward && !back) return;
    const end = field.value.length;
    if (
      forward
        ? field.selectionStart !== end || field.selectionEnd !== end
        : field.selectionEnd !== 0
    ) {
      return;
    }
    const panel = field.closest<HTMLElement>('[data-slot="cascader-panel"]');
    const row = panel?.querySelector<HTMLElement>('[role="option"][data-highlighted]');
    if (!panel || !row) return;
    const header = row.querySelector('[data-slot="provider-group-header"]');
    if (!header) {
      // Back on a model goes to its group's header, as in a tree.
      if (back) stepUpToGroupHeader(event, field, panel, row);
      return;
    }
    if (header.hasAttribute('data-collapsed')) return;
    event.preventDefault();
    if (back) row.click();
    else
      field.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
      );
  }

  const visibilityButton = (
    <Button
      aria-label={managingVisibility || hiddenProviders.size ? undefined : 'Hide providers'}
      aria-pressed={managingVisibility}
      className="shrink-0 text-label font-normal text-muted-foreground hover:text-foreground aria-pressed:text-foreground"
      data-slot="provider-visibility-mode"
      onClick={() => setManagingVisibility((current) => !current)}
      size="xs"
      type="button"
      variant={managingVisibility ? 'secondary' : 'ghost'}
    >
      {managingVisibility ? (
        <EyeOffIcon data-icon="inline-start" />
      ) : (
        <EyeIcon data-icon={hiddenProviders.size ? 'inline-start' : undefined} />
      )}
      {managingVisibility ? 'Done' : hiddenProviders.size ? `Hidden ${hiddenProviders.size}` : null}
    </Button>
  );

  return (
    <Cascader
      closeOnSelect={false}
      estimateRowSize={30}
      // The model row draws the spec's leading ✓ itself.
      indicator={false}
      inline
      inputValue={query}
      items={columnNodes}
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
        if (grouped) {
          if (details.reason === 'drill' && header?.startsWith(MORE_NODE_PREFIX)) {
            const groupId = header.slice(MORE_NODE_PREFIX.length);
            setOpenGroups((current) => new Set(current).add(groupId));
            return;
          }
          if (details.reason === 'drill' && header?.startsWith(PROVIDER_NODE_PREFIX)) {
            const groupId = header.slice(PROVIDER_NODE_PREFIX.length);
            toggleCollapsed(groupId);
            setFocusProviderId(groupId);
            setNotice(undefined);
            if (search.searching) keepQueryOnce.current = true;
          }
          return;
        }
        if (header === ALCF_FAMILY_VALUE) {
          setAlcfExpanded(!alcfExpanded);
          if (alcfExpanded && isAlcfServer(activeGroup?.id)) setPath([]);
          return;
        }
        if (searchColumns) {
          // Moving between "All providers" and one provider keeps the search;
          // the cascader clears its query on every path change.
          setPath(nextPath);
          setNotice(undefined);
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
        // Enter or a click on the current model confirms it: just close.
        if (details.reason !== 'reselect') onChange(choice);
        onClose();
      }}
      path={grouped ? EMPTY_PATH : path}
      renderItem={(node) =>
        node.data?.kind === 'search-header' ? (
          <SearchResultsHeader data={node.data} icon={node.icon} />
        ) : node.data?.kind === 'provider-manage' ? (
          <ProviderManageRow
            fold={foldFilters}
            group={node.data.group}
            onClose={onOpenSettings}
            preset={presetsById.get(node.data.group.id)}
          />
        ) : node.data?.kind === 'provider-family' ? (
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
          flush={grouped}
          stage={
            node.data?.kind === 'provider'
              ? node.data.group.id === activeGroup?.id
                ? activeStage
                : installStages.get(node.data.group.id)
              : undefined
          }
          eyeAsStaticElement={providerRowsAreTrailButtons}
          filterCount={
            node.data?.kind === 'provider' && prepared.has(node.data.group.id)
              ? tree.counts.get(node.data.group.id)
              : undefined
          }
          search={
            (grouped || search.searching) && node.data?.kind === 'provider'
              ? {
                  count: search.counts.get(node.data.group.id) ?? { matches: 0, total: 0 },
                  collapsed: search.collapsed.has(node.data.group.id),
                  plain: grouped,
                  column: searchColumns,
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
      filter={filter}
      // Nothing chosen yet: keep the path the picker opened on.
      revealSelected={Boolean(selectedChoice)}
      // Search typed lists its matches in "All providers" (two columns) or in
      // the grouped list (one column): never a deep scan.
      searchScope="level"
      // Every hit is listed (the lists are windowed): the counts beside the
      // search and each provider must agree with the rows.
      searchLimit={Number.POSITIVE_INFINITY}
      selectable={(node) => node.data?.kind === 'model'}
      // Always controlled: a refused pick (a surrogate) must not stay checked.
      value={
        selectedChoice
          ? (searchColumns && path[0] === SEARCH_ALL_VALUE ? SEARCH_RESULT_PREFIX : '') +
            modelNodeValue(selectedChoice)
          : ''
      }
    >
      <CascaderPanel
        className={cn(
          'h-full min-h-0',
          // Filters covers the list: a short catalog must not squeeze its rows.
          facetsOpen && 'min-h-[min(27.5rem,70dvh)]',
          // Search results and the narrow groups: a provider row is a group
          // header that draws its own count and fold chevron. Two columns keep
          // the drill chevron and swap the model count for the match count.
          searchColumns
            ? '[&_[data-slot=cascader-item-count]]:hidden'
            : (grouped || search.searching) && '[&_[data-slot=cascader-item-trailing]]:hidden',
        )}
      >
        <CascaderNav className="gap-0 border-border p-0">
          <div
            className="flex w-full min-w-0 items-center"
            onKeyDownCapture={grouped ? handleGroupLevelKey : undefined}
          >
            <ModelPickerSearch
              availableTokens={tree.availableTokens}
              onQueryChange={handleQueryChange}
              facetTabs={facetTabs}
              facetsOpen={facetsOpen}
              maxInputPrice={maxInputPrice}
              sizes={hasSizes}
              onFacetsOpenChange={setFacetsOpen}
              onTokensChange={setTokens}
              query={query}
              quietTokens={DEFAULT_FILTER_TOKENS}
              shown={search.matches}
              tokens={tokens}
              total={search.total}
              compact={foldFilters}
              single={grouped}
            />
          </div>
        </CascaderNav>
        {/* A live provider can report hundreds of models, and every row
                  carries an icon, a description and a health indicator. Both
                  layouts render through the windowed items, which fall back to
                  the plain rows below the cascader's own threshold. The active
                  provider's action UI (see `activeProviderActionsContent`
                  above) lands as the providers column's own `footer` in columns
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
              const noMatchColumn =
                column.active && column.parent?.value === SEARCH_ALL_VALUE && noMatch;
              return (
                <CascaderVirtualColumn
                  column={column}
                  empty={
                    noMatchColumn
                      ? noMatchPanel
                      : providerColumn
                        ? loadingModels
                          ? loadingPanel
                          : panel.column.empty
                        : undefined
                  }
                  // The provider bar sits under the providers, as the spec's two columns do.
                  footer={column.depth === 0 && activeGroup ? panel.column.footer : undefined}
                  key={column.depth}
                />
              );
            }}
          </CascaderColumns>
        ) : null}
        {/* Browsing columns too: Base UI opens on the chosen row without showing
            it, so the first arrow press otherwise only reveals it. */}
        {showColumns ? <ModelPickerHighlightSeed /> : null}
        {showColumns ? null : (
          <>
            <CascaderList className="w-full flex-1" maxHeight="100%">
              <CascaderVirtualItems />
            </CascaderList>
            <ModelPickerHighlightSeed />
            {noMatch ? noMatchPanel : null}
            {/* Each group's manage row carries its actions and, for a provider
                that is not usable yet, its fix. */}
            {activeGroup && loadingModels ? loadingPanel : null}
          </>
        )}
        <CascaderFooter className="mt-auto p-0">
          <PickerFooter
            className="h-9 border-t-0 px-2"
            end={
              hiddenProviders.size || managingVisibility ? (
                visibilityButton
              ) : (
                // Nothing hidden: the eye alone, named on hover, still opens the manage mode.
                <NamedTooltip label="Hide providers" side="top">
                  {visibilityButton}
                </NamedTooltip>
              )
            }
            hints={footerHints(showColumns, searchColumns)}
            hintsAlign={showColumns ? 'end' : 'start'}
            start={
              <>
                {showColumns && panel.column.bar ? (
                  <div
                    className="-ms-2 h-full w-[calc(50%-.5px)] shrink-0 border-e"
                    data-slot="picker-provider-bar"
                  >
                    {panel.column.bar}
                  </div>
                ) : null}
                {loading || prepared.size < visibleProviders.length ? (
                  <LoadingFeedback
                    label={loading ? 'Refreshing models…' : 'Loading remaining models…'}
                  />
                ) : grouped && search.emptyProviders ? (
                  <span className="min-w-0 truncate" data-slot="providers-without-matches">
                    {search.emptyProviders} {search.emptyProviders === 1 ? 'provider' : 'providers'}{' '}
                    with no matches
                  </span>
                ) : null}
              </>
            }
          />
        </CascaderFooter>
        <CascaderStatus />
      </CascaderPanel>
    </Cascader>
  );
});

/** One column: models a provider's group lists before its "N more" row. */
const GROUP_PREVIEW = 3;

const GROUP_HEADER = '[data-slot="provider-group-header"]';

/**
 * Moves the highlight from a model up to its group's header with the list's own ArrowUp, so the
 * cascader keeps one highlight. A long search group can render its header only once scrolled to,
 * so each frame steps as far as the rendered rows show, for a bounded number of frames.
 */
function stepUpToGroupHeader(
  event: ReactKeyboardEvent<HTMLDivElement>,
  field: HTMLInputElement,
  panel: HTMLElement,
  row: HTMLElement,
): void {
  const rowsAbove = (from: HTMLElement) => {
    const rows = [
      ...panel.querySelectorAll<HTMLElement>('[role="option"]:not([aria-disabled="true"])'),
    ];
    let steps = 0;
    for (let index = rows.indexOf(from) - 1; index >= 0; index -= 1) {
      steps += 1;
      if (rows[index]!.querySelector(GROUP_HEADER)) return { steps, header: true };
    }
    return { steps, header: false };
  };
  if (!rowsAbove(row).steps) return;
  event.preventDefault();
  const up = () =>
    field.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
    );
  let current = row;
  let frames = 0;
  const step = () => {
    const { steps, header } = rowsAbove(current);
    for (let index = 0; index < Math.max(1, steps); index += 1) up();
    if (header) return;
    requestAnimationFrame(() => {
      const next = panel.querySelector<HTMLElement>('[role="option"][data-highlighted]');
      // Stop at a header, or at the top where the highlight no longer moves.
      if (!next || next === current || next.querySelector(GROUP_HEADER) || ++frames > 30) return;
      current = next;
      step();
    });
  };
  step();
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

/**
 * Word, then key: the picker's keys. One column keeps Move, Choose and Close,
 * words and all (Move ↑↓ · Choose ↵ · Close Esc). Search typed in two
 * columns trades Close for Filters, as the spec's search footer does.
 * Columns shows only when the picker is wide; Move drops next, and the last
 * hint always shows.
 */
function footerHints(columns: boolean, searching = false): PickerHint[] {
  if (!columns) {
    return [
      { label: 'Move', shortcut: 'menu-move' },
      { label: 'Choose', shortcut: 'menu-pick' },
      { label: 'Close', shortcut: 'menu-close' },
    ];
  }
  return [
    { label: 'Move', shortcut: 'menu-move', optional: true },
    { label: 'Choose', shortcut: 'menu-pick' },
    { label: 'Columns', shortcut: 'menu-columns', wide: true },
    searching
      ? { label: 'Filters', shortcut: 'menu-filters' }
      : { label: 'Close', shortcut: 'menu-close' },
  ];
}

/** A provider's header over its matches in "All providers": `name  3 / 312`. */
function SearchResultsHeader({ data, icon }: { data: SearchHeaderNodeData; icon?: ReactNode }) {
  return (
    <span
      className="flex h-7 w-full min-w-0 items-center gap-2 px-2 pt-1 text-label text-muted-foreground [&_svg]:size-3.5"
      data-slot="search-results-header"
    >
      {icon ? <span className="grid size-4 shrink-0 place-items-center">{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate">{data.group.name}</span>
      <span
        aria-label={`${data.matches} of ${data.total} models match`}
        className="shrink-0 font-mono text-[0.65625rem] text-faint tabular-nums"
      >
        {data.matches} / {data.total}
      </span>
    </span>
  );
}
