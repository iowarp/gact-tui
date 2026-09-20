import { ActivityIcon, EyeIcon, EyeOffIcon, RefreshCwIcon, SettingsIcon } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
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
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useMediaQuery } from '@/hooks/use-media-query';
import type { ClioModelOption } from '@/lib/model-options';
import { PROVIDER_VISIBILITY_CHANGED_EVENT } from '@/lib/installer-infrastructure';
import { providerLogoId } from '@/lib/provider-presentation';
import { cn } from '@/lib/utils';

interface ClioModelPickerProps {
  catalogStatus?: 'error' | 'loading' | 'ready';
  model?: string;
  onChange: (choice: ClioModelOption) => void;
  onRetryCatalog?: () => void;
  options: readonly ClioModelOption[];
  provider?: string;
  title?: string;
  trigger: ReactNode;
}

interface ProviderGroup {
  id: string;
  name: string;
  choices: ClioModelOption[];
  availableChoices: ClioModelOption[];
  endpoint?: string;
  configurationUrl: string;
  freshness?: string;
  health: ProviderHealth;
  detail?: string;
}

interface ProviderNodeData {
  kind: 'provider';
  group: ProviderGroup;
}

interface ModelNodeData {
  kind: 'model';
  choice: ClioModelOption;
}

type PickerNodeData = ProviderNodeData | ModelNodeData;
type ProviderHealth = 'healthy' | 'degraded' | 'unavailable';

const HIDDEN_PROVIDERS_STORAGE_KEY = 'clio.hidden-providers.v1';
const PROVIDER_NODE_PREFIX = 'provider:';
const MODEL_NODE_PREFIX = 'model:';

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
  const [managingVisibility, setManagingVisibility] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [hiddenProviders, setHiddenProviders] = useState<Set<string>>(readHiddenProviders);
  useEffect(() => {
    const refreshHiddenProviders = () => setHiddenProviders(readHiddenProviders());
    window.addEventListener(PROVIDER_VISIBILITY_CHANGED_EVENT, refreshHiddenProviders);
    return () =>
      window.removeEventListener(PROVIDER_VISIBILITY_CHANGED_EVENT, refreshHiddenProviders);
  }, []);
  const showColumns = useMediaQuery('(min-width: 768px)');
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
    return grouped.map(toProviderGroup).sort((left, right) => {
      const healthOrder = { healthy: 0, degraded: 1, unavailable: 2 };
      return (
        healthOrder[left.health] - healthOrder[right.health] || left.name.localeCompare(right.name)
      );
    });
  }, [options]);
  const [path, setPath] = useState<string[]>(() => {
    const initialProvider = provider ?? providers[0]?.id;
    return initialProvider ? [providerNodeValue(initialProvider)] : [];
  });
  const visibleProviders = useMemo(
    () => providers.filter((item) => showHidden || !hiddenProviders.has(item.id)),
    [hiddenProviders, providers, showHidden],
  );
  const providerNodes = useMemo<CascaderNode<PickerNodeData>[]>(
    () =>
      visibleProviders.map((group) => ({
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
        children: group.availableChoices.map((choice) => ({
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
        })),
      })),
    [visibleProviders],
  );
  const activeGroup =
    providers.find((item) => providerNodeValue(item.id) === path[0]) ?? visibleProviders[0];
  const selectedChoice = options.find(
    (choice) => choice.available && choice.providerId === provider && choice.id === model,
  );

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

  function restoreAllProviders(): void {
    const nextHidden = new Set<string>();
    persistHiddenProviders(nextHidden);
    setHiddenProviders(nextHidden);
    setShowHidden(false);
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
      const preferred = providers.find((item) => item.id === provider) ?? visibleProviders[0];
      if (preferred) setPath([providerNodeValue(preferred.id)]);
      return;
    }
    setQuery('');
    setManagingVisibility(false);
    setShowHidden(false);
  }

  function toggleVisibilityManagement(): void {
    const next = !managingVisibility;
    setManagingVisibility(next);
    setShowHidden(next && hiddenProviders.size > 0);
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
          <ModelCatalogError onRetry={onRetryCatalog} />
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
            onInputValueChange={setQuery}
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
                <div className="flex w-full min-w-0 items-center gap-1 pe-8 md:w-1/2 md:pe-0">
                  <div className="min-w-0 flex-1">
                    <CascaderInput
                      aria-label="Search providers and models"
                      placeholder="Search providers and models"
                    />
                  </div>
                  {activeGroup ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        aria-label={
                          hiddenProviders.size
                            ? `Manage provider visibility, ${hiddenProviders.size} hidden`
                            : 'Manage provider visibility'
                        }
                        aria-pressed={managingVisibility}
                        data-slot="provider-visibility-mode"
                        onClick={toggleVisibilityManagement}
                        size="icon-sm"
                        title={
                          managingVisibility
                            ? 'Finish managing provider visibility'
                            : 'Manage provider visibility'
                        }
                        type="button"
                        variant={managingVisibility ? 'secondary' : 'ghost'}
                      >
                        {managingVisibility ? (
                          <EyeOffIcon aria-hidden="true" />
                        ) : (
                          <EyeIcon aria-hidden="true" />
                        )}
                      </Button>
                      <Button asChild size="icon-sm" title="Configure provider" variant="ghost">
                        <Link
                          aria-label={`Configure ${activeGroup.name} provider`}
                          to={activeGroup.configurationUrl}
                        >
                          <SettingsIcon aria-hidden="true" />
                        </Link>
                      </Button>
                    </div>
                  ) : null}
                </div>
              </CascaderNav>
              {/* A live provider can report hundreds of models, and every row
                  carries an icon, a description and a health indicator. Both
                  layouts render through the windowed items, which fall back to
                  the plain rows below the cascader's own threshold. */}
              {showColumns ? (
                <CascaderColumns
                  className="w-full flex-1"
                  columnWidth="calc(50% - .5px)"
                  maxHeight="100%"
                >
                  {(column) => <CascaderVirtualColumn column={column} key={column.depth} />}
                </CascaderColumns>
              ) : (
                <CascaderList className="w-full flex-1" maxHeight="100%">
                  <CascaderVirtualItems />
                </CascaderList>
              )}
              {activeGroup?.detail ? (
                <div
                  className={cn(
                    'flex shrink-0 items-center justify-between gap-3 border-t px-3 py-2 text-xs',
                    activeGroup.health === 'degraded'
                      ? 'text-warning-foreground'
                      : 'text-muted-foreground',
                  )}
                  role={activeGroup.health === 'degraded' ? 'alert' : 'status'}
                >
                  <span>{activeGroup.detail}</span>
                  {activeGroup.health === 'unavailable' ? (
                    <Button asChild className="shrink-0" size="sm" variant="secondary">
                      <Link to={activeGroup.configurationUrl}>Set up {activeGroup.name}</Link>
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {managingVisibility && hiddenProviders.size ? (
                <CascaderFooter className="min-h-11 flex-row items-center gap-1 px-2">
                  <div className="flex min-w-0 items-center gap-1">
                    <Button
                      aria-label={`Show ${hiddenProviders.size} hidden ${hiddenProviders.size === 1 ? 'provider' : 'providers'}`}
                      aria-pressed={showHidden}
                      onClick={() => setShowHidden((current) => !current)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {showHidden ? (
                        <EyeOffIcon data-icon="inline-start" />
                      ) : (
                        <EyeIcon data-icon="inline-start" />
                      )}
                      Hidden ({hiddenProviders.size})
                    </Button>
                    {showHidden && hiddenProviders.size ? (
                      <Button
                        aria-label="Restore all hidden providers"
                        onClick={restoreAllProviders}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Restore all
                      </Button>
                    ) : null}
                  </div>
                </CascaderFooter>
              ) : null}
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
  hidden,
  managingVisibility,
  node,
  onToggleVisibility,
}: {
  hidden: boolean;
  managingVisibility: boolean;
  node: CascaderNode<PickerNodeData>;
  onToggleVisibility?: () => void;
  state: CascaderItemState<PickerNodeData>;
}) {
  if (node.data?.kind === 'provider') {
    return (
      <span className="flex w-full min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-start font-medium">{node.label}</span>
        <ProviderVisibilityControl
          group={node.data.group}
          hidden={hidden}
          managingVisibility={managingVisibility}
          onToggle={onToggleVisibility}
        />
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

function ProviderVisibilityControl({
  group,
  hidden,
  managingVisibility,
  onToggle,
}: {
  group: ProviderGroup;
  hidden: boolean;
  managingVisibility: boolean;
  onToggle?: () => void;
}) {
  const presentation = providerHealthPresentation(group.health);
  const action = hidden ? `Show ${group.name}` : `Hide ${group.name}`;
  const interactive = managingVisibility && onToggle !== undefined;
  const stopRowAction = (event: { preventDefault(): void; stopPropagation(): void }) => {
    event.preventDefault();
    event.stopPropagation();
  };
  return (
    <HoverCard openDelay={180}>
      <HoverCardTrigger asChild>
        <span
          {...(interactive
            ? { 'aria-label': `${action}; provider status: ${presentation.label}` }
            : { 'aria-hidden': true })}
          className={cn(
            'pointer-events-auto inline-flex size-6 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            interactive ? 'cursor-pointer hover:bg-accent' : 'cursor-help',
            hidden ? 'text-muted-foreground' : presentation.color,
          )}
          data-slot="provider-visibility-toggle"
          onClick={(event) => {
            stopRowAction(event);
            if (interactive) onToggle();
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            stopRowAction(event);
            if (interactive) onToggle();
          }}
          onMouseDown={stopRowAction}
          onMouseUp={stopRowAction}
          role={interactive ? 'button' : 'presentation'}
          tabIndex={interactive ? 0 : -1}
          title={
            interactive ? `${action} in this picker` : `${group.name} status: ${presentation.label}`
          }
        >
          {hidden ? (
            <EyeOffIcon aria-hidden="true" className="size-4" />
          ) : (
            <ActivityIcon aria-hidden="true" className="size-4" />
          )}
        </span>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="flex w-72 flex-col gap-1 text-xs">
        <p className="font-medium">
          {interactive
            ? hidden
              ? 'Hidden from this picker'
              : 'Visible in this picker'
            : 'Provider status'}
        </p>
        <p>Health: {presentation.label}</p>
        <p>Refreshed: {group.freshness ? formatFreshness(group.freshness) : 'Unavailable'}</p>
        {group.endpoint ? <p className="truncate text-muted-foreground">{group.endpoint}</p> : null}
        {group.detail ? <p className="text-muted-foreground">{group.detail}</p> : null}
        <p className="text-muted-foreground">
          {interactive
            ? `Click to ${hidden ? 'show' : 'hide'} this provider.`
            : 'Use Manage visibility to show or hide providers.'}
        </p>
      </HoverCardContent>
    </HoverCard>
  );
}

function providerHealthPresentation(health: ProviderHealth): { color: string; label: string } {
  return {
    healthy: { color: 'text-success', label: 'Ready' },
    degraded: { color: 'text-warning', label: 'Needs attention' },
    unavailable: { color: 'text-muted-foreground/55', label: 'Unavailable' },
  }[health];
}

function toProviderGroup(group: {
  id: string;
  name: string;
  choices: ClioModelOption[];
}): ProviderGroup {
  // A provider row stands for the provider itself, so it can never become a
  // model someone picks.
  const availableChoices = group.choices.filter(
    (choice) => choice.available && choice.kind !== 'provider',
  );
  const reportedHealth = group.choices.find((choice) => choice.health)?.health?.toLowerCase();
  const health: ProviderHealth = availableChoices.length
    ? reportedHealth === 'degraded' || reportedHealth === 'error'
      ? 'degraded'
      : 'healthy'
    : reportedHealth === 'degraded' || reportedHealth === 'error'
      ? 'degraded'
      : 'unavailable';
  const details = [
    ...new Set(
      group.choices
        .map((choice) => choice.availabilityDetail)
        .filter((detail): detail is string => Boolean(detail)),
    ),
  ];
  return {
    ...group,
    availableChoices,
    endpoint: group.choices.find((choice) => choice.endpoint)?.endpoint,
    configurationUrl: providerConfigurationUrl(
      group.id,
      group.choices.find((choice) => choice.configurationUrl)?.configurationUrl,
    ),
    freshness: group.choices.find((choice) => choice.freshness)?.freshness,
    health,
    detail: details[0],
  };
}

function providerConfigurationUrl(providerId: string, reported?: string): string {
  if (reported?.startsWith('/settings/providers?')) return reported;
  return `/settings/providers?provider=${encodeURIComponent(providerId)}`;
}

function providerNodeValue(providerId: string): string {
  return `${PROVIDER_NODE_PREFIX}${providerId}`;
}

function modelNodeValue(choice: ClioModelOption): string {
  return `${MODEL_NODE_PREFIX}${choice.providerId}:${choice.id}`;
}

function providerSearchDescription(group: ProviderGroup): string {
  if (group.health === 'unavailable') return 'Unavailable';
  const count = group.availableChoices.length;
  return `${count} ${count === 1 ? 'model' : 'models'}`;
}

function formatFreshness(freshness: string): string {
  const parsed = new Date(freshness);
  return Number.isNaN(parsed.getTime()) ? freshness : parsed.toLocaleString();
}

function readHiddenProviders(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const value = JSON.parse(window.localStorage.getItem(HIDDEN_PROVIDERS_STORAGE_KEY) ?? '[]');
    return new Set(Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

function persistHiddenProviders(providerIds: Set<string>): void {
  try {
    window.localStorage.setItem(
      HIDDEN_PROVIDERS_STORAGE_KEY,
      JSON.stringify([...providerIds].sort()),
    );
  } catch {
    // Storage can be full or blocked outright (private windows, a locked-down
    // profile). Hiding a provider is a convenience for this tab; losing it
    // across reloads is not worth taking the picker down with an exception,
    // and the reader is guarded the same way.
  }
}
