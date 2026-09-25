import { useQuery } from '@tanstack/react-query';
import { ActivityIcon, EyeIcon, EyeOffIcon, LoaderCircleIcon, RefreshCwIcon } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorLogo,
  ModelSelectorTrigger,
} from '@/components/ai-elements/model-selector';
import {
  Cascader,
  CascaderList,
  CascaderPanel,
  CascaderStatus,
} from '@/components/reui/cascader/cascader';
import { CascaderColumns } from '@/components/reui/cascader/cascader-columns';
import { CascaderFooter } from '@/components/reui/cascader/cascader-footer';
import { CascaderInput, CascaderNav } from '@/components/reui/cascader/cascader-nav';
import {
  CascaderVirtualColumn,
  CascaderVirtualItems,
} from '@/components/reui/cascader/cascader-virtual';
import type { CascaderItemState } from '@/components/reui/cascader/cascader-context';
import type { CascaderNode } from '@/components/reui/cascader/cascader-types';
import { IconTile } from '@/components/reui/icon-tile';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FieldSeparator } from '@/components/ui/field';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Toggle } from '@/components/ui/toggle';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useRepository } from '@/hooks/use-repository';
import type { ClioModelOption } from '@/lib/model-options';
import { PROVIDER_VISIBILITY_CHANGED_EVENT } from '@/lib/installer-infrastructure';
import { translateKnownProviderErrorReason } from '@/lib/provider-availability';
import { providerLogoId } from '@/lib/provider-presentation';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { useConnectionSettings } from '@/providers/connection-provider';
import {
  formatFreshness,
  modelNodeValue,
  type PickerNodeData,
  providerHealthPresentation,
  providerNodeValue,
  providerSearchDescription,
  type ProviderGroup,
  readHiddenProviders,
  persistHiddenProviders,
  PROVIDER_HEALTH_ORDER,
  readyTransportsPreset,
  toProviderGroup,
  transportHasModels,
  transportHeadingNodeValue,
  transportScopedPreset,
} from './model-picker-model';
import { ProviderActionPanel } from './provider-action-panel';
import { useProviderSettingsActions } from './settings-models-actions';

interface ClioModelPickerProps {
  catalogRefreshing?: boolean;
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
  catalogRefreshing = false,
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
  const [hiddenProviders, setHiddenProviders] = useState<Set<string>>(readHiddenProviders);
  useEffect(() => {
    const refreshHiddenProviders = () => setHiddenProviders(readHiddenProviders());
    window.addEventListener(PROVIDER_VISIBILITY_CHANGED_EVENT, refreshHiddenProviders);
    return () =>
      window.removeEventListener(PROVIDER_VISIBILITY_CHANGED_EVENT, refreshHiddenProviders);
  }, []);
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
  const providers = useMemo(() => {
    const grouped = Object.values(
      options.reduce<Record<string, { id: string; name: string; choices: ClioModelOption[] }>>(
        (groups, option) => {
          const group = (groups[option.providerId] ??= {
            id: option.providerId,
            name: option.providerName,
            choices: [],
          });
          group.choices.push(option);
          return groups;
        },
        {},
      ),
    );
    return grouped.map(toProviderGroup);
  }, [options]);
  // A preset the service reports but that has never had a catalog/model
  // entry of its own (never checked, never configured) gets a zero-model
  // placeholder row of its own -- but ONLY while managing, so browsing the
  // picker normally never shows a provider with nothing to offer yet.
  const configuredIds = useMemo(() => new Set(providers.map((item) => item.id)), [providers]);
  const unconfiguredProviders = useMemo(
    () =>
      presets
        .filter((preset) => !configuredIds.has(preset.id))
        .map((preset) => toProviderGroup({ id: preset.id, name: preset.label, choices: [] })),
    [presets, configuredIds],
  );
  const allProviders = useMemo(
    () => (managingVisibility ? [...providers, ...unconfiguredProviders] : providers),
    [managingVisibility, providers, unconfiguredProviders],
  );
  const sortedProviders = useMemo(
    () =>
      [...allProviders].sort(
        (left, right) =>
          PROVIDER_HEALTH_ORDER[left.health] - PROVIDER_HEALTH_ORDER[right.health] ||
          left.name.localeCompare(right.name),
      ),
    [allProviders],
  );
  const [path, setPath] = useState<string[]>(() => {
    return provider ? [providerNodeValue(provider)] : [];
  });
  const visibleProviders = useMemo(
    () => sortedProviders.filter((item) => managingVisibility || !hiddenProviders.has(item.id)),
    [hiddenProviders, sortedProviders, managingVisibility],
  );
  const presetsById = useMemo(() => new Map(presets.map((preset) => [preset.id, preset])), [presets]);
  const providerNodes = useMemo<CascaderNode<PickerNodeData>[]>(
    () =>
      visibleProviders.map((group) => {
        const modelNode = (choice: ClioModelOption): CascaderNode<PickerNodeData> => ({
          value: modelNodeValue(choice),
          label: choice.label,
          description: choice.description ?? choice.modalities?.join(', '),
          keywords: [
            choice.id,
            choice.providerId,
            choice.providerName,
            choice.availabilityDetail ?? '',
            ...(choice.modalities ?? []),
          ],
          data: { kind: 'model', choice },
        });
        // The two-half submenu, driven ONLY by transports.length > 1 (never a
        // per-provider check): each transport that already has models gets
        // its own labelled, non-selectable heading INSIDE this tree (e.g.
        // "Codex (local)" above the SDK's models) -- a transport with no
        // models yet (needs sign-in/install) contributes nothing here; its
        // heading + action render in the sibling strip below instead.
        const modelChildren: CascaderNode<PickerNodeData>[] =
          (group.transports?.length ?? 0) > 1
            ? group.transports!.flatMap((transport): CascaderNode<PickerNodeData>[] => {
                const transportChoices = group.availableChoices.filter(
                  (choice) => choice.transport === transport.id,
                );
                if (!transportChoices.length) return [];
                return [
                  {
                    value: transportHeadingNodeValue(group.id, transport.id),
                    label: transport.label,
                    disabled: true,
                    keywords: [],
                    data: { kind: 'transport-heading', label: transport.label },
                  },
                  ...transportChoices.map(modelNode),
                ];
              })
            : group.availableChoices.map(modelNode);
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
          count: group.availableChoices.length,
          keywords: [
            group.id,
            group.endpoint ?? '',
            group.detail ?? '',
            ...group.choices.flatMap((choice) => [choice.id, choice.label]),
          ],
          data: { kind: 'provider', group },
          children: modelChildren,
        };
      }),
    [visibleProviders],
  );
  const activeGroup = allProviders.find((item) => providerNodeValue(item.id) === path[0]);
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
  // The two-half split's own state: which of the active provider's transports
  // (if more than one) still need an action -- rendered in the strip below,
  // "or"-separated from whatever the tree already showed with its own
  // heading (see `providerNodes`).
  const activeTransports = activeGroup?.transports ?? [];
  const hasMultipleTransports = activeTransports.length > 1;
  const activeActionTransports = hasMultipleTransports
    ? activeTransports.filter((transport) => !transportHasModels(activeGroup!, transport.id))
    : [];
  // The provider-level actions of a multi-transport provider (Verify provider
  // / Refresh models, plus Sign out when a READY transport supports it) --
  // once, above the per-transport sections, never repeated per transport. A
  // check probes every transport, so it is also the SDK half's own action
  // while that half is unchecked (the SDK is the user's own Codex login:
  // CLIO can check it, never sign it in or out).
  const activeReadyPreset =
    activePreset && hasMultipleTransports
      ? readyTransportsPreset(activePreset, activeTransports)
      : undefined;
  // One actions instance, scoped to whichever provider's submenu is open --
  // the SAME hook and mutations Settings > Providers uses (one implementation
  // per action; see ProviderActionPanel).
  const providerActions = useProviderSettingsActions({
    presetId: activeGroup?.id ?? '',
    apiBase: activeGroup?.endpoint ?? activePreset?.api_base ?? '',
    onDefaultModel: () => {},
    preset: activePreset,
  });
  const { reset: resetProviderActions, stage: activeStage } = providerActions;
  // A stale sign-in/check/install result from the PREVIOUS provider must not
  // leak into the newly active one's submenu.
  useEffect(() => {
    resetProviderActions();
  }, [activeGroup?.id, resetProviderActions]);

  // The active provider's detail/sign-in/install/key/check UI. Rendered as
  // the active column's own `footer` (columns mode) or directly below the
  // single list (drill mode) -- never a node inside the Cascader's tree: its
  // combobox keeps real focus on its own search input (see the constant
  // above), so a typed field like the API-key box can only work outside it.
  // Red only for a real failure; "needs a key / sign-in / install" is neutral.
  const activeFailed = activeGroup?.health === 'degraded' || activeGroup?.health === 'unavailable';
  const activeProviderActionsContent =
    activeGroup && (activeStage || activeGroup.detail || activePreset) ? (
      <div
        className="flex min-w-0 shrink-0 flex-col gap-2 border-t px-3 py-2"
        data-slot="provider-action-strip"
      >
        {/* While an action runs its stage replaces the last verdict (a stale
            "missing key" must not sit beside "Saving key…"); once it settles
            the row's fresh detail -- or nothing, when ready -- comes back. */}
        {activeStage ? (
          <p
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
            data-slot="provider-action-stage"
            role="status"
          >
            <LoaderCircleIcon aria-hidden="true" className="size-3.5 animate-spin text-warning" />
            {activeStage}
          </p>
        ) : activeGroup.detail ? (
          <p
            className={cn(
              'text-xs',
              activeFailed ? 'text-destructive' : 'text-muted-foreground',
            )}
            role={activeFailed ? 'alert' : 'status'}
          >
            {activeGroup.detail}
          </p>
        ) : null}
        {activeReadyPreset ? (
          <ProviderActionPanel actions={providerActions} compact preset={activeReadyPreset} />
        ) : null}
        {activePreset ? (
          hasMultipleTransports ? (
            // The second half of the two-half submenu: only the transports
            // the tree above did NOT already show with their own
            // heading+models. "or" separates each section from the one
            // before it -- including from the tree's own section, when it
            // rendered one.
            activeActionTransports.map((transport, index) => (
              <Fragment key={transport.id}>
                {index > 0 || activeReadyPreset ? (
                  <FieldSeparator className="my-0 text-xs **:data-[slot=field-separator-content]:bg-popover">
                    or
                  </FieldSeparator>
                ) : null}
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-semibold text-muted-foreground">{transport.label}</p>
                  {transport.auth ? (
                    <ProviderActionPanel
                      actions={providerActions}
                      compact
                      preset={transportScopedPreset(activePreset, transport)}
                    />
                  ) : transport.reason ? (
                    <p className="text-xs text-muted-foreground" title={transport.reason}>
                      {translateKnownProviderErrorReason(transport.reason, activeGroup.name)}
                    </p>
                  ) : null}
                </div>
              </Fragment>
            ))
          ) : (
            <ProviderActionPanel actions={providerActions} compact preset={activePreset} />
          )
        ) : null}
      </div>
    ) : null;

  function hideProvider(group: ProviderGroup): void {
    const nextHidden = new Set(hiddenProviders).add(group.id);
    persistHiddenProviders(nextHidden);
    setHiddenProviders(nextHidden);
    const nextProvider = providers.find((item) => item.id !== group.id && !nextHidden.has(item.id));
    setPath(nextProvider ? [providerNodeValue(nextProvider.id)] : []);
  }

  function showProvider(group: ProviderGroup): void {
    const nextHidden = new Set(hiddenProviders);
    nextHidden.delete(group.id);
    persistHiddenProviders(nextHidden);
    setHiddenProviders(nextHidden);
  }

  function toggleProviderVisibility(node: CascaderNode<PickerNodeData>): void {
    if (node.data?.kind !== 'provider') return;
    const group = node.data.group;
    if (hiddenProviders.has(group.id)) showProvider(group);
    else hideProvider(group);
  }

  function handleOpenChange(nextOpen: boolean): void {
    setOpen(nextOpen);
    if (nextOpen) {
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
    if (nextQuery.trim() && !query.trim()) setPath([]);
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
            onPathChange={(nextPath) => setPath(nextPath)}
            onValueChange={(_value, details) => {
              if (details.node?.data?.kind !== 'model') return;
              onChange(details.node.data.choice);
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
            searchScope="deep"
            selectable={(node) => node.data?.kind === 'model'}
            value={selectedChoice ? modelNodeValue(selectedChoice) : undefined}
          >
            <CascaderPanel className="h-full min-h-0">
              <CascaderNav>
                <div className="flex w-full min-w-0 items-center gap-1 pe-8">
                  <div className="min-w-0 flex-1">
                    <CascaderInput
                      aria-label="Search providers and models"
                      placeholder="Search providers and models"
                    />
                  </div>
                  {activeGroup && onRetryCatalog ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        aria-label={`Refresh ${activeGroup.name} provider and models`}
                        disabled={catalogRefreshing}
                        onClick={() => onRetryCatalog(activeGroup.id)}
                        size="icon-sm"
                        title={`Refresh ${activeGroup.name} provider and models`}
                        type="button"
                        variant="ghost"
                      >
                        <RefreshCwIcon
                          aria-hidden="true"
                          className={catalogRefreshing ? 'animate-spin' : undefined}
                        />
                      </Button>
                    </div>
                  ) : null}
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
                  {(column) => (
                    <CascaderVirtualColumn
                      column={column}
                      footer={column.active ? activeProviderActionsContent : undefined}
                      key={column.depth}
                    />
                  )}
                </CascaderColumns>
              ) : (
                <>
                  <CascaderList className="w-full flex-1" maxHeight="100%">
                    <CascaderVirtualItems />
                  </CascaderList>
                  {activeProviderActionsContent}
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
                {activeStage && activeGroup ? (
                  <span
                    className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground"
                    data-slot="provider-action-footer-stage"
                  >
                    <LoaderCircleIcon aria-hidden="true" className="size-3.5 shrink-0 animate-spin text-warning" />
                    {activeGroup.name}: {activeStage}
                  </span>
                ) : null}
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
              <RefreshCwIcon data-icon="inline-start" />
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
  hidden,
  managingVisibility,
  node,
  onToggleVisibility,
  stage,
}: {
  eyeAsStaticElement: boolean;
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
      </span>
    );
  }
  if (node.data?.kind === 'transport-heading') {
    // A label, not a row: no description slot, no health, nothing selectable
    // -- the tree's own "Codex (local)" / "Direct" section heading.
    return (
      <span className="w-full truncate text-start text-xs font-semibold text-muted-foreground">
        {node.data.label}
      </span>
    );
  }
  const description = node.data?.choice.description ?? node.data?.choice.modalities?.join(', ');
  return (
    <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
      <span className="w-full truncate text-start">{node.label}</span>
      {description ? (
        <span className="w-full truncate text-start text-xs text-muted-foreground">
          {description}
        </span>
      ) : null}
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

/** The heartbeat: health colour on EVERY row, hidden or not -- detail lives in
 * the HoverCard. A running action (`stage`) shows as `checking` (yellow) with
 * its stage as the label until it settles back to the row's real health. */
function ProviderHeartbeat({ group, stage }: { group: ProviderGroup; stage?: string }) {
  const presentation = stage
    ? { ...providerHealthPresentation('checking'), label: stage }
    : providerHealthPresentation(group.health);
  return (
    <HoverCard openDelay={180}>
      <HoverCardTrigger asChild>
        <span
          aria-label={`${group.name} status: ${presentation.label}`}
          className={cn(
            'pointer-events-auto inline-flex size-6 shrink-0 cursor-help items-center justify-center rounded-md',
            presentation.color,
          )}
          data-slot="provider-heartbeat"
          data-state={stage ? 'checking' : group.health}
          onClick={(event) => event.stopPropagation()}
          role="img"
          title={`${group.name} status: ${presentation.label}`}
        >
          <ActivityIcon aria-hidden="true" className="size-4" />
        </span>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="flex w-72 flex-col gap-1 text-xs">
        <p className="font-medium">Provider status</p>
        <p>Health: {presentation.label}</p>
        <p>Refreshed: {group.freshness ? formatFreshness(group.freshness) : 'Unavailable'}</p>
        {group.endpoint ? <p className="truncate text-muted-foreground">{group.endpoint}</p> : null}
        {group.detail ? <p className="text-muted-foreground">{group.detail}</p> : null}
      </HoverCardContent>
    </HoverCard>
  );
}

