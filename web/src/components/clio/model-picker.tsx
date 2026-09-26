import { useQuery } from '@tanstack/react-query';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { RefreshIcon } from '@/lib/icon-vocabulary';
import { useMemo, useState, type ReactNode } from 'react';
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorTrigger,
} from '@/components/ai-elements/model-selector';
import {
  Cascader,
  CascaderList,
  CascaderPanel,
  CascaderStatus,
} from '@/components/reui/cascader/cascader';
import {
  CascaderColumns,
  CascaderSectionedItems,
} from '@/components/reui/cascader/cascader-columns';
import { CascaderFooter } from '@/components/reui/cascader/cascader-footer';
import { CascaderNav } from '@/components/reui/cascader/cascader-nav';
import {
  CascaderVirtualColumn,
  CascaderVirtualItems,
} from '@/components/reui/cascader/cascader-virtual';
import type { CascaderItemState } from '@/components/reui/cascader/cascader-context';
import type { CascaderNode } from '@/components/reui/cascader/cascader-types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Toggle } from '@/components/ui/toggle';
import { useHiddenProviders } from '@/hooks/use-hidden-providers';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useRepository } from '@/hooks/use-repository';
import type { ClioModelOption } from '@/lib/model-options';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { useConnectionSettings } from '@/providers/connection-provider';
import { isBaselineTag, modelCapabilityTagsFromOption, modelTypeOf } from '@/lib/model-capability-tags';
import {
  DEFAULT_FILTER_TOKENS,
  freeSearchText,
  matchesFreeSearch,
  surrogateChatReason,
  tagFilterToken,
  type ModelFilterToken,
} from '@/lib/model-filter-tokens';
import { ModelCapabilityTags } from './model-capability-tags';
import {
  modelNodeValue,
  type PickerNodeData,
  providerGroupsFromOptions,
  providerNodeValue,
  type ProviderGroup,
} from './model-picker-model';
import { useProviderPanel } from './model-picker-provider-panel';
import { ModelPickerSearch } from './model-picker-search';
import { useModelPickerTree, type ProviderFilterCount } from './model-picker-tree';
import { ProviderHeartbeat } from './provider-heartbeat';

interface ClioModelPickerProps {
  catalogStatus?: 'error' | 'loading' | 'ready';
  model?: string;
  onChange: (choice: ClioModelOption) => void;
  onRetryCatalog?: (providerId?: string) => void;
  options: readonly ClioModelOption[];
  provider?: string;
  title?: string;
  trigger: ReactNode;
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

/** Searchable AI Elements dialog composed with the real ReUI columns cascader. */
export function ClioModelPicker({
  catalogStatus = 'ready',
  model,
  onChange,
  onRetryCatalog,
  options,
  provider,
  title = 'Choose a model',
  trigger,
}: ClioModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // ONE state, ONE footer button (v15 ruling): "Hidden (N)" IS the manage
  // action. On: every row -- hidden or shown, configured or not -- appears,
  // and the eye toggle on each becomes interactive. Off: hidden providers
  // (and not-yet-configured presets) drop back out of the list.
  const [managingVisibility, setManagingVisibility] = useState(false);
  const { hiddenProviders, setProviderHidden } = useHiddenProviders();
  const showColumns = useMediaQuery('(min-width: 768px)');
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  // The full preset (auth_method, requires_api_key, status, transports, ...)
  // that ClioModelOption does not carry per row -- read from the SAME cached
  // query Settings uses, so this never issues a second network request.
  const configuration = useQuery({
    queryKey: queryKeys.key('language-model-configuration', settings.endpoint),
    queryFn: ({ signal }) => repository.languageModelConfiguration(signal),
  });
  const presetsData = configuration.data?.presets;
  const presets = useMemo(() => presetsData ?? [], [presetsData]);
  // A preset the service reports but that has never had a catalog/model
  // entry of its own (never checked, never configured) gets a zero-model
  // placeholder row of its own -- but ONLY while managing, so browsing the
  // picker normally never shows a provider with nothing to offer yet.
  const providers = useMemo(
    () => providerGroupsFromOptions(options, presets, false),
    [options, presets],
  );
  const sortedProviders = useMemo(
    () => (managingVisibility ? providerGroupsFromOptions(options, presets, true) : providers),
    [managingVisibility, options, presets, providers],
  );
  const [path, setPath] = useState<string[]>(() => {
    return provider ? [providerNodeValue(provider)] : [];
  });
  const visibleProviders = useMemo(
    () => sortedProviders.filter((item) => managingVisibility || !hiddenProviders.has(item.id)),
    [hiddenProviders, sortedProviders, managingVisibility],
  );
  const presetsById = useMemo(() => new Map(presets.map((preset) => [preset.id, preset])), [presets]);
  const [tokens, setTokens] = useState<ModelFilterToken[]>(() => [...DEFAULT_FILTER_TOKENS]);
  const [notice, setNotice] = useState<string>();
  const tree = useModelPickerTree(visibleProviders, tokens);
  const providerNodes = tree.nodes;
  const activeGroup = sortedProviders.find((item) => providerNodeValue(item.id) === path[0]);
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
  const activePreset = presetsById.get(activeGroup?.id ?? '');
  // The provider in view's right-hand panel: its sections, setup state and
  // action row, from the SAME shared action hook every provider surface uses.
  const panel = useProviderPanel({ group: activeGroup, preset: activePreset, open, notice });
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
    if (node.data?.kind !== 'provider') return;
    const group = node.data.group;
    if (hiddenProviders.has(group.id)) showProvider(group);
    else hideProvider(group);
  }

  function handleOpenChange(nextOpen: boolean): void {
    setOpen(nextOpen);
    setNotice(undefined);
    if (nextOpen) {
      setTokens([...DEFAULT_FILTER_TOKENS]);
      const preferred = providers.find((item) => item.id === provider);
      setPath(preferred ? [providerNodeValue(preferred.id)] : []);
      return;
    }
    setQuery('');
    setManagingVisibility(false);
  }

  function handleQueryChange(nextQuery: string): void {
    // A provider path is useful for browsing, but it turns deep search into a
    // search inside that provider and leaves the old provider pinned beside a
    // global hit. Start every new search at the root; choosing a result can
    // then establish the path that remains when the query is cleared.
    // A token being typed ("input:") is not a search: only free text is.
    if (freeSearchText(nextQuery) && !freeSearchText(query)) setPath([]);
    setQuery(nextQuery);
  }

  return (
    <ModelSelector onOpenChange={handleOpenChange} open={open}>
      <ModelSelectorTrigger asChild>{trigger}</ModelSelectorTrigger>
      <ModelSelectorContent
        className="h-[min(38rem,calc(100dvh-2rem))] w-[min(56rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] overflow-hidden sm:h-[min(42rem,calc(100dvh-3rem))] sm:max-w-[56rem]"
        commandProps={{ className: 'min-h-0 p-0', shouldFilter: false }}
        title={title}
      >
        {catalogStatus === 'loading' ? (
          <ModelCatalogSkeleton columns={showColumns} />
        ) : catalogStatus === 'error' ? (
          <ModelCatalogError onRetry={() => onRetryCatalog?.(activeGroup?.id)} />
        ) : (
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
            onPathChange={(nextPath) => {
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
              setOpen(false);
              setQuery('');
            }}
            path={path}
            renderLabel={(node, state) => (
              <PickerRowLabel
                stage={
                  node.data?.kind === 'provider' && node.data.group.id === activeGroup?.id
                    ? activeStage
                    : undefined
                }
                eyeAsStaticElement={providerRowsAreTrailButtons}
                filterCount={
                  node.data?.kind === 'provider' ? tree.counts.get(node.data.group.id) : undefined
                }
                onTagToken={(token) =>
                  setTokens((current) => (current.includes(token) ? current : [...current, token]))
                }
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
            filter={(node, normalizedQuery) => matchesFreeSearch(node, normalizedQuery)}
            // Nothing chosen yet: keep the path the picker opened on.
            revealSelected={Boolean(selectedChoice)}
            searchScope={freeSearchText(query) ? 'deep' : 'level'}
            selectable={(node) => node.data?.kind === 'model'}
            // Always controlled: a refused pick (a surrogate) must not stay checked.
            value={selectedChoice ? modelNodeValue(selectedChoice) : ''}
          >
            <CascaderPanel className="h-full min-h-0">
              <CascaderNav>
                <div className="flex w-full min-w-0 items-center gap-1 pe-8">
                  <ModelPickerSearch
                    availableTokens={tree.availableTokens}
                    onQueryChange={handleQueryChange}
                    onTokensChange={setTokens}
                    query={query}
                    shown={tree.shown}
                    tokens={tokens}
                    total={tree.total}
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
                <CascaderColumns className="w-full flex-1" columnWidth={PICKER_COLUMN_WIDTH} maxHeight="100%">
                  {(column) => {
                    const providerColumn =
                      column.active &&
                      activeGroup !== undefined &&
                      column.parent?.value === providerNodeValue(activeGroup.id);
                    return (
                      <CascaderVirtualColumn
                        column={column}
                        empty={providerColumn ? panel.column.empty : undefined}
                        footer={providerColumn ? panel.column.footer : undefined}
                        key={column.depth}
                        sections={
                          providerColumn && panel.column.sections
                            ? panel.column.sections(column.items)
                            : undefined
                        }
                      />
                    );
                  }}
                </CascaderColumns>
              ) : (
                <>
                  <CascaderList className="w-full flex-1" maxHeight="100%">
                    {path.length && panel.column.sections ? (
                      <CascaderSectionedItems sections={panel.column.sections} />
                    ) : (
                      <CascaderVirtualItems />
                    )}
                  </CascaderList>
                  {path.length ? (
                    <>
                      {panel.column.empty}
                      {panel.column.footer}
                    </>
                  ) : null}
                </>
              )}
              <CascaderFooter className="min-h-11 flex-row items-center justify-between gap-1 px-2">
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
              </CascaderFooter>
              <CascaderStatus />
            </CascaderPanel>
          </Cascader>
        )}
      </ModelSelectorContent>
    </ModelSelector>
  );
}

function ModelCatalogSkeleton({ columns }: { columns: boolean }) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading available models"
      className="flex size-full min-h-0 flex-col"
      role="status"
    >
      <div className="shrink-0 border-b p-2">
        <Skeleton className="h-9 w-full" />
      </div>
      <div className={cn('grid min-h-0 flex-1', columns && 'grid-cols-2 divide-x')}>
        <div className="flex min-h-0 flex-col gap-2 p-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="flex h-11 items-center gap-2" key={index}>
              <Skeleton className="size-8 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="size-4 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
        {columns ? (
          <div className="flex min-h-0 flex-col gap-3 p-3">
            {Array.from({ length: 5 }, (_, index) => (
              <div className="flex h-11 flex-col gap-1.5" key={index}>
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <span className="sr-only">Discovering providers and models from the connected service.</span>
    </div>
  );
}

function ModelCatalogError({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex size-full items-start p-4">
      <Alert variant="destructive">
        <AlertTitle>Models could not be loaded</AlertTitle>
        <AlertDescription>
          <span>Check the provider connection or configuration, then try discovery again.</span>
          {onRetry ? (
            <Button className="mt-3" onClick={onRetry} size="sm" type="button" variant="outline">
              <RefreshIcon data-icon="inline-start" />
              Retry
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    </div>
  );
}

function PickerRowLabel({
  eyeAsStaticElement,
  filterCount,
  onTagToken,
  hidden,
  managingVisibility,
  node,
  onToggleVisibility,
  stage,
}: {
  eyeAsStaticElement: boolean;
  /** Set while filter tokens hide some of this provider's models. */
  filterCount?: ProviderFilterCount;
  /** Clicking a row's tag adds its filter token. */
  onTagToken: (token: ModelFilterToken) => void;
  hidden: boolean;
  managingVisibility: boolean;
  node: CascaderNode<PickerNodeData>;
  onToggleVisibility?: () => void;
  /** The running action's stage for THIS provider: the heartbeat turns yellow. */
  stage?: string;
  state: CascaderItemState<PickerNodeData>;
}) {
  if (node.data?.kind === 'provider') {
    // The owner's row template: normal mode is `name heartbeat count ›`,
    // with NO eye at all -- "Hidden (N)" IS the manage action, so the eye
    // exists only once that mode is entered (every row, hidden or shown).
    // The model count and the drill chevron are the Cascader's own trailing
    // slots and render after this label unconditionally.
    return (
      <span className="flex w-full min-w-0 items-center gap-1.5">
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
        {filterCount && filterCount.shown !== filterCount.total ? (
          <span
            aria-label={`${filterCount.shown} of ${filterCount.total} models shown`}
            className="shrink-0 text-xs text-muted-foreground tabular-nums"
            data-slot="provider-filter-count"
          >
            {filterCount.shown} / {filterCount.total}
          </span>
        ) : null}
      </span>
    );
  }
  const choice = node.data?.kind === 'model' ? node.data.choice : undefined;
  const tags = choice ? modelCapabilityTagsFromOption(choice).filter((tag) => !isBaselineTag(tag)) : [];
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

/** The eye: rendered ONLY while managing visibility (the caller does not
 * mount this at all outside that mode -- normal mode is `name heartbeat
 * count ›`, no eye) -- BESIDE the heartbeat, never replacing it.
 *
 * `asStaticElement` renders the SAME Toggle onto a `<span>` instead of its
 * default `<button>` (Radix `asChild`) -- needed exactly when this row is
 * itself already a real `<button>` (a non-active Cascader column; see
 * `providerRowsAreTrailButtons` above). A `<button>` nested in a `<button>`
 * is invalid HTML; a `<span>` keeps the identical look, click and
 * `onPressedChange` behaviour (Radix drives both from its own props, not
 * from the child's tag), consistent with every row here already being
 * `tabIndex={-1}` -- these controls are activated by click, never by an
 * independent Tab stop. */
function ProviderEyeToggle({
  asStaticElement,
  group,
  hidden,
  onToggle,
}: {
  asStaticElement: boolean;
  group: ProviderGroup;
  hidden: boolean;
  onToggle: () => void;
}) {
  const icon = hidden ? (
    <EyeOffIcon aria-hidden="true" className="size-3.5" />
  ) : (
    <EyeIcon aria-hidden="true" className="size-3.5" />
  );
  return (
    <Toggle
      aria-label={hidden ? `Show ${group.name} in this picker` : `Hide ${group.name} in this picker`}
      asChild={asStaticElement}
      className="size-6 min-w-0 p-0"
      data-slot="provider-visibility-toggle"
      onClick={(event) => event.stopPropagation()}
      onPressedChange={onToggle}
      pressed={hidden}
      size="sm"
      title={hidden ? `Show ${group.name}` : `Hide ${group.name}`}
    >
      {asStaticElement ? (
        <span role="button" tabIndex={-1}>
          {icon}
        </span>
      ) : (
        icon
      )}
    </Toggle>
  );
}
