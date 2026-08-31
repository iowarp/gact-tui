import { ActivityIcon, CheckIcon, EyeIcon, EyeOffIcon, SettingsIcon } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from '@/components/ai-elements/model-selector';
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

type ProviderHealth = 'healthy' | 'degraded' | 'unavailable';

const HIDDEN_PROVIDERS_STORAGE_KEY = 'clio.hidden-providers.v1';

/** Searchable AI Elements model picker shared by session and agent surfaces. */
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
  const [requestedProvider, setRequestedProvider] = useState<string | undefined>(
    provider ?? providers[0]?.id,
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleProviders = useMemo(() => {
    const visibilityFiltered = providers.filter(
      (item) =>
        showHidden ||
        !hiddenProviders.has(item.id) ||
        item.id === provider ||
        item.id === requestedProvider,
    );
    return normalizedQuery
      ? visibilityFiltered.filter((item) =>
          [item.name, item.id, ...item.choices.flatMap((choice) => [choice.label, choice.id])]
            .join(' ')
            .toLocaleLowerCase()
            .includes(normalizedQuery),
        )
      : visibilityFiltered;
  }, [hiddenProviders, normalizedQuery, provider, providers, requestedProvider, showHidden]);
  const activeGroup =
    visibleProviders.find((item) => item.id === requestedProvider) ?? visibleProviders[0];
  const visibleModels = (activeGroup?.availableChoices ?? []).filter(
    (choice) =>
      !normalizedQuery ||
      [choice.label, choice.id, choice.description, choice.availabilityDetail]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalizedQuery),
  );

  return (
    <ModelSelector onOpenChange={setOpen} open={open}>
      <ModelSelectorTrigger asChild>{trigger}</ModelSelectorTrigger>
      <ModelSelectorContent
        className="h-[min(44rem,calc(100dvh-2rem))] w-[min(64rem,calc(100vw-2rem))] max-w-none overflow-hidden sm:min-w-[42rem]"
        commandProps={{ shouldFilter: false }}
        title={title}
      >
        <ModelSelectorInput
          onValueChange={setQuery}
          placeholder="Search providers and models"
          value={query}
        />
        <div className="flex min-h-10 items-center justify-between gap-3 border-b px-3 py-1.5">
          <p className="truncate text-xs text-muted-foreground">
            {providers.length} providers ·{' '}
            {providers.reduce((total, item) => total + item.availableChoices.length, 0)} available
            models
          </p>
          {hiddenProviders.size ? (
            <Button
              aria-pressed={showHidden}
              className="h-7 shrink-0 gap-1.5 px-2 text-xs"
              onClick={() => setShowHidden((visible) => !visible)}
              size="sm"
              variant="ghost"
            >
              {showHidden ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
              {showHidden ? 'Hide hidden' : `${hiddenProviders.size} hidden`}
            </Button>
          ) : null}
        </div>
        <ModelSelectorList className="max-h-none flex-1">
          <ModelSelectorEmpty>No available models match your search.</ModelSelectorEmpty>
          {visibleProviders.length > 0 ? (
            <div className="grid h-full min-h-96 grid-cols-1 divide-y sm:grid-cols-[minmax(15rem,0.85fr)_minmax(24rem,1.65fr)] sm:divide-x sm:divide-y-0">
              <div
                aria-label="Providers"
                className="max-h-52 space-y-1 overflow-y-auto p-2 sm:max-h-none"
                role="listbox"
              >
                {visibleProviders.map((item) => (
                  <Button
                    aria-selected={item.id === activeGroup?.id}
                    className={cn(
                      'h-auto min-h-11 w-full justify-start gap-2 rounded-lg px-2 py-1.5 font-normal',
                      item.id === activeGroup?.id
                        ? 'bg-accent hover:bg-accent'
                        : 'hover:bg-muted',
                    )}
                    key={item.id}
                    onClick={() => setRequestedProvider(item.id)}
                    role="option"
                    type="button"
                    variant="ghost"
                  >
                    <ModelSelectorLogo provider={providerLogoId(item.id)} />
                    <ModelSelectorName>
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="block min-w-0 flex-1 truncate font-medium">
                          {item.name}
                        </span>
                        <ProviderHealthDot health={item.health} />
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {providerSummary(item)}
                      </span>
                    </ModelSelectorName>
                  </Button>
                ))}
              </div>
              <div className="min-w-0 p-2">
                <div className="mb-2 flex min-h-12 items-start gap-2 border-b px-2 pb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold">{activeGroup?.name}</p>
                      {activeGroup ? <ProviderHealthDot health={activeGroup.health} label /> : null}
                    </div>
                    {activeGroup?.endpoint ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {activeGroup.endpoint}
                      </p>
                    ) : null}
                  </div>
                  {activeGroup ? <ProviderEvidence group={activeGroup} /> : null}
                  {activeGroup && activeGroup.id !== provider ? (
                    <Button
                      aria-label={`Hide ${activeGroup.name}`}
                      onClick={() => {
                        const next = new Set(hiddenProviders).add(activeGroup.id);
                        persistHiddenProviders(next);
                        setHiddenProviders(next);
                        setRequestedProvider(
                          providers.find((item) => item.id !== activeGroup.id && !next.has(item.id))
                            ?.id,
                        );
                      }}
                      size="icon-sm"
                      title="Hide provider from this picker"
                      variant="ghost"
                    >
                      <EyeOffIcon aria-hidden="true" />
                    </Button>
                  ) : activeGroup && hiddenProviders.has(activeGroup.id) ? (
                    <Button
                      aria-label={`Show ${activeGroup.name}`}
                      onClick={() => {
                        const next = new Set(hiddenProviders);
                        next.delete(activeGroup.id);
                        persistHiddenProviders(next);
                        setHiddenProviders(next);
                      }}
                      size="icon-sm"
                      title="Show provider in this picker"
                      variant="ghost"
                    >
                      <EyeIcon aria-hidden="true" />
                    </Button>
                  ) : null}
                  <Button asChild size="icon-sm" title="Configure provider" variant="ghost">
                    <Link
                      aria-label={`Configure ${activeGroup?.name ?? 'provider'}`}
                      to={activeGroup?.configurationUrl ?? '/settings/providers'}
                    >
                      <SettingsIcon aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
                {activeGroup?.detail ? (
                  <div
                    className={
                      activeGroup.health === 'degraded'
                        ? 'mb-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground'
                        : 'mb-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground'
                    }
                    role={activeGroup.health === 'degraded' ? 'alert' : 'status'}
                  >
                    {activeGroup.detail}
                  </div>
                ) : null}
                <div aria-label="Models" className="space-y-1" role="listbox">
                  {visibleModels.map((choice) => (
                    <ModelSelectorItem
                      disabled={!choice.available}
                      key={`${choice.providerId}:${choice.id}`}
                      onSelect={() => {
                        onChange(choice);
                        setOpen(false);
                      }}
                      title={
                        choice.availabilityDetail ??
                        choice.description ??
                        choice.modalities?.join(', ')
                      }
                      value={`${choice.providerName} ${choice.label} ${choice.id}`}
                    >
                      <ModelSelectorName>
                        <span className="block truncate">{choice.label}</span>
                        {choice.modalities?.length || choice.description ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {choice.description ?? choice.modalities?.join(', ')}
                          </span>
                        ) : null}
                      </ModelSelectorName>
                      {provider === choice.providerId && model === choice.id ? (
                        <CheckIcon aria-hidden="true" className="size-4 text-primary" />
                      ) : null}
                    </ModelSelectorItem>
                  ))}
                  {visibleModels.length === 0 ? (
                    <div className="grid place-items-center gap-3 px-4 py-12 text-center">
                      <p className="max-w-sm text-sm text-muted-foreground">
                        {normalizedQuery
                          ? 'No available models from this provider match the search.'
                          : 'This provider has no currently available models. Configure or reconnect it to discover models.'}
                      </p>
                      {activeGroup ? (
                        <Button asChild size="sm" variant="outline">
                          <Link to={activeGroup.configurationUrl}>
                            <SettingsIcon aria-hidden="true" /> Configure {activeGroup.name}
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  );
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

function providerSummary(group: ProviderGroup): string {
  if (group.health === 'unavailable') return 'Unavailable';
  const count = group.availableChoices.length;
  return `${count} available ${count === 1 ? 'model' : 'models'}`;
}

function ProviderHealthDot({ health, label = false }: { health: ProviderHealth; label?: boolean }) {
  const presentation = {
    healthy: { color: 'bg-success', text: 'Ready' },
    degraded: { color: 'bg-warning', text: 'Needs attention' },
    unavailable: { color: 'bg-muted-foreground/45', text: 'Unavailable' },
  }[health];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
      <span aria-hidden="true" className={`size-2 rounded-full ${presentation.color}`} />
      {label ? (
        <span>{presentation.text}</span>
      ) : (
        <span className="sr-only">{presentation.text}</span>
      )}
    </span>
  );
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

function ProviderEvidence({ group }: { group: ProviderGroup }) {
  const iconColor = {
    healthy: 'text-success',
    degraded: 'text-warning',
    unavailable: 'text-muted-foreground',
  }[group.health];
  return (
    <HoverCard openDelay={180}>
      <HoverCardTrigger asChild>
        <Button aria-label="Provider health and catalog freshness" size="icon-sm" variant="ghost">
          <ActivityIcon aria-hidden="true" className={iconColor} />
        </Button>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="w-72 space-y-1 text-xs">
        <p className="font-medium">Provider catalog evidence</p>
        <p>Health: {group.health}</p>
        <p>
          Refreshed: {group.freshness ? new Date(group.freshness).toLocaleString() : 'Unavailable'}
        </p>
        {group.detail ? <p className="text-muted-foreground">{group.detail}</p> : null}
      </HoverCardContent>
    </HoverCard>
  );
}
