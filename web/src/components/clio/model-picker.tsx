import { ActivityIcon, CheckIcon, SettingsIcon } from 'lucide-react';
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
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import type { ClioModelOption } from '@/lib/model-options';
import { providerLogoId } from '@/lib/provider-presentation';

interface ClioModelPickerProps {
  model?: string;
  onChange: (choice: ClioModelOption) => void;
  options: readonly ClioModelOption[];
  provider?: string;
  title?: string;
  trigger: ReactNode;
}

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
  const providers = useMemo(
    () =>
      Object.values(
        options.reduce<
          Record<string, { id: string; name: string; choices: ClioModelOption[] }>
        >((groups, option) => {
          const group = (groups[option.providerId] ??= {
            id: option.providerId,
            name: option.providerName,
            choices: [],
          });
          group.choices.push(option);
          return groups;
        }, {}),
      ).sort((left, right) => left.name.localeCompare(right.name)),
    [options],
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleProviders = useMemo(
    () =>
      normalizedQuery
        ? providers.filter((item) =>
            [item.name, item.id, ...item.choices.flatMap((choice) => [choice.label, choice.id])]
              .join(' ')
              .toLocaleLowerCase()
              .includes(normalizedQuery),
          )
        : providers,
    [normalizedQuery, providers],
  );
  const [requestedProvider, setRequestedProvider] = useState(provider ?? providers[0]?.id);
  const activeGroup =
    visibleProviders.find((item) => item.id === requestedProvider) ?? visibleProviders[0];
  const visibleModels = (activeGroup?.choices ?? []).filter(
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
        className="w-[min(46rem,calc(100vw-2rem))] max-w-none overflow-hidden"
        commandProps={{ shouldFilter: false }}
        title={title}
      >
        <ModelSelectorInput
          onValueChange={setQuery}
          placeholder="Search providers and models"
          value={query}
        />
        <ModelSelectorList className="max-h-[min(32rem,70vh)]">
          <ModelSelectorEmpty>No available models match your search.</ModelSelectorEmpty>
          {visibleProviders.length > 0 ? (
            <div className="grid min-h-80 grid-cols-1 divide-y sm:grid-cols-[minmax(11rem,0.8fr)_minmax(16rem,1.4fr)] sm:divide-x sm:divide-y-0">
              <div
                aria-label="Providers"
                className="max-h-44 space-y-1 overflow-y-auto p-2 sm:max-h-none"
                role="listbox"
              >
                {visibleProviders.map((item) => (
                  <ModelSelectorItem
                    aria-selected={item.id === activeGroup?.id}
                    className="min-h-11 rounded-lg data-[selected=true]:bg-accent"
                    key={item.id}
                    onSelect={() => setRequestedProvider(item.id)}
                    value={`${item.name} ${item.id} ${item.choices.map((choice) => choice.id).join(' ')}`}
                  >
                    <ModelSelectorLogo provider={providerLogoId(item.id)} />
                    <ModelSelectorName>
                      <span className="block truncate font-medium">{item.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {item.choices.length} {item.choices.length === 1 ? 'model' : 'models'}
                      </span>
                    </ModelSelectorName>
                  </ModelSelectorItem>
                ))}
              </div>
              <div className="min-w-0 p-2">
                <div className="mb-2 flex min-h-9 items-center gap-2 px-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{activeGroup?.name}</p>
                    {activeGroup?.choices[0]?.endpoint ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {activeGroup.choices[0].endpoint}
                      </p>
                    ) : null}
                  </div>
                  {activeGroup?.choices[0] ? (
                    <ProviderEvidence option={activeGroup.choices[0]} />
                  ) : null}
                  <Button asChild size="icon-sm" title="Configure provider" variant="ghost">
                    <Link
                      aria-label={`Configure ${activeGroup?.name ?? 'provider'}`}
                      to={
                        activeGroup?.choices[0]?.configurationUrl ||
                        `/settings/providers?provider=${encodeURIComponent(activeGroup?.id ?? '')}`
                      }
                    >
                      <SettingsIcon aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
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
                        choice.availabilityDetail ?? choice.description ?? choice.modalities?.join(', ')
                      }
                      value={`${choice.providerName} ${choice.label} ${choice.id}`}
                    >
                      <ModelSelectorName>
                        <span className="block truncate">{choice.label}</span>
                        {choice.modalities?.length || choice.description || choice.availabilityDetail ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {choice.availabilityDetail ??
                              choice.description ??
                              choice.modalities?.join(', ')}
                          </span>
                        ) : null}
                      </ModelSelectorName>
                      {provider === choice.providerId && model === choice.id ? (
                        <CheckIcon aria-hidden="true" className="size-4 text-primary" />
                      ) : null}
                    </ModelSelectorItem>
                  ))}
                  {visibleModels.length === 0 ? (
                    <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                      No models from this provider match.
                    </p>
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

function ProviderEvidence({ option }: { option: ClioModelOption }) {
  return (
    <HoverCard openDelay={180}>
      <HoverCardTrigger asChild>
        <Button aria-label="Provider health and catalog freshness" size="icon-sm" variant="ghost">
          <ActivityIcon aria-hidden="true" />
        </Button>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="w-72 space-y-1 text-xs">
        <p className="font-medium">Live catalog evidence</p>
        <p>Health: {option.health || 'Unavailable'}</p>
        <p>
          Refreshed:{' '}
          {option.freshness ? new Date(option.freshness).toLocaleString() : 'Unavailable'}
        </p>
      </HoverCardContent>
    </HoverCard>
  );
}
