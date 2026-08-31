import { EyeIcon, EyeOffIcon, SettingsIcon } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorLogo,
  ModelSelectorTrigger,
} from '@/components/ai-elements/model-selector';
import { Cascader, CascaderPanel, CascaderStatus } from '@/components/reui/cascader/cascader';
import { CascaderColumns } from '@/components/reui/cascader/cascader-columns';
import { CascaderFooter } from '@/components/reui/cascader/cascader-footer';
import { CascaderInput, CascaderNav } from '@/components/reui/cascader/cascader-nav';
import type { CascaderItemState } from '@/components/reui/cascader/cascader-context';
import type { CascaderNode } from '@/components/reui/cascader/cascader-types';
import { IconTile } from '@/components/reui/icon-tile';
import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import type { ClioModelOption } from '@/lib/model-options';
import { providerLogoId } from '@/lib/provider-presentation';
import { cn } from '@/lib/utils';

interface ClioModelPickerProps {
  model?: string;
  onChange: (choice: ClioModelOption) => void;
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
  model,
  onChange,
  options,
  provider,
  title = 'Choose a model',
  trigger,
}: ClioModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [hiddenProviders, setHiddenProviders] = useState<Set<string>>(readHiddenProviders);
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
    () =>
      providers.filter(
        (item) => showHidden || !hiddenProviders.has(item.id) || item.id === provider,
      ),
    [hiddenProviders, provider, providers, showHidden],
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

  function handleOpenChange(nextOpen: boolean): void {
    setOpen(nextOpen);
    if (nextOpen) {
      const preferred = providers.find((item) => item.id === provider) ?? visibleProviders[0];
      if (preferred) setPath([providerNodeValue(preferred.id)]);
      return;
    }
    setQuery('');
    setShowHidden(false);
  }

  return (
    <ModelSelector onOpenChange={handleOpenChange} open={open}>
      <ModelSelectorTrigger asChild>{trigger}</ModelSelectorTrigger>
      <ModelSelectorContent
        className="h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] overflow-hidden sm:max-w-[66rem]"
        commandProps={{ className: 'min-h-0 p-0', shouldFilter: false }}
        title={title}
      >
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
          mode="columns"
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
              node={node}
              state={state}
            />
          )}
          searchScope="deep"
          selectable={(node) => node.data?.kind === 'model'}
          value={selectedChoice ? modelNodeValue(selectedChoice) : undefined}
        >
          <CascaderPanel className="h-full min-h-0">
            <CascaderNav>
              <CascaderInput
                aria-label="Search providers and models"
                placeholder="Search providers and models"
              />
            </CascaderNav>
            <CascaderColumns
              className="w-full flex-1"
              columnWidth="min(32rem, calc((100vw - 3rem) / 2))"
              maxHeight="100%"
            />
            {activeGroup?.detail ? (
              <div
                className={cn(
                  'shrink-0 border-t px-3 py-2 text-xs',
                  activeGroup.health === 'degraded'
                    ? 'text-warning-foreground'
                    : 'text-muted-foreground',
                )}
                role={activeGroup.health === 'degraded' ? 'alert' : 'status'}
              >
                {activeGroup.detail}
              </div>
            ) : null}
            {activeGroup || hiddenProviders.size ? (
              <CascaderFooter className="min-h-11 flex-row items-center justify-between gap-2 px-2">
                <div className="flex min-w-0 items-center gap-1">
                  {hiddenProviders.size ? (
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
                  ) : null}
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
                {activeGroup ? (
                  <div className="flex shrink-0 items-center gap-1">
                    {activeGroup.id !== provider ? (
                      <Button
                        aria-label={
                          hiddenProviders.has(activeGroup.id)
                            ? `Show ${activeGroup.name}`
                            : `Hide ${activeGroup.name}`
                        }
                        onClick={() =>
                          hiddenProviders.has(activeGroup.id)
                            ? showProvider(activeGroup)
                            : hideProvider(activeGroup)
                        }
                        size="icon-sm"
                        title={
                          hiddenProviders.has(activeGroup.id)
                            ? 'Show provider in this picker'
                            : 'Hide provider from this picker'
                        }
                        type="button"
                        variant="ghost"
                      >
                        {hiddenProviders.has(activeGroup.id) ? (
                          <EyeIcon aria-hidden="true" />
                        ) : (
                          <EyeOffIcon aria-hidden="true" />
                        )}
                      </Button>
                    ) : null}
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
              </CascaderFooter>
            ) : null}
            <CascaderStatus />
          </CascaderPanel>
        </Cascader>
      </ModelSelectorContent>
    </ModelSelector>
  );
}

function PickerRowLabel({
  hidden,
  node,
}: {
  hidden: boolean;
  node: CascaderNode<PickerNodeData>;
  state: CascaderItemState<PickerNodeData>;
}) {
  if (node.data?.kind === 'provider') {
    return (
      <span className="flex w-full min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-start font-medium">{node.label}</span>
        {hidden ? (
          <EyeOffIcon aria-label="Hidden provider" className="text-muted-foreground" />
        ) : null}
        <ProviderHealthIndicator group={node.data.group} />
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

function ProviderHealthIndicator({ group }: { group: ProviderGroup }) {
  const presentation = providerHealthPresentation(group.health);
  return (
    <HoverCard openDelay={180}>
      <HoverCardTrigger asChild>
        <span
          aria-label={`${group.name} provider status: ${presentation.label}`}
          className="inline-flex size-5 shrink-0 items-center justify-center"
          role="img"
        >
          <span aria-hidden="true" className={cn('size-2.5 rounded-full', presentation.color)} />
        </span>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="flex w-72 flex-col gap-1 text-xs">
        <p className="font-medium">Provider availability</p>
        <p>Health: {presentation.label}</p>
        <p>Refreshed: {group.freshness ? formatFreshness(group.freshness) : 'Unavailable'}</p>
        {group.endpoint ? <p className="truncate text-muted-foreground">{group.endpoint}</p> : null}
        {group.detail ? <p className="text-muted-foreground">{group.detail}</p> : null}
      </HoverCardContent>
    </HoverCard>
  );
}

function providerHealthPresentation(health: ProviderHealth): { color: string; label: string } {
  return {
    healthy: { color: 'bg-success', label: 'Ready' },
    degraded: { color: 'bg-warning', label: 'Needs attention' },
    unavailable: { color: 'bg-muted-foreground/45', label: 'Unavailable' },
  }[health];
}

function toProviderGroup(group: {
  id: string;
  name: string;
  choices: ClioModelOption[];
}): ProviderGroup {
  const availableChoices = group.choices.filter((choice) => choice.available);
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
  window.localStorage.setItem(
    HIDDEN_PROVIDERS_STORAGE_KEY,
    JSON.stringify([...providerIds].sort()),
  );
}
