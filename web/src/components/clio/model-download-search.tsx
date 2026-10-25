import { useState } from 'react';
import type { RegistryModel } from '@clio/core/v3';
import { CheckIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Field, FieldLabel } from '@/components/ui/field';
import { buildModelFacets, hubTaskLabel, type FacetEntry } from '@/lib/model-facets';
import {
  matchesFilterTokens,
  modelFilterTokens,
  providerFilterToken,
} from '@/lib/model-filter-tokens';
import type { ModelCapabilityTag } from '@/lib/model-capability-tags';
import { displayedTags } from '@/lib/model-capability-tags';
import { registryModelTags } from '@/lib/registry-model-tags';
import { modelFactSummary } from '@/lib/model-facts';
import { ModelCapabilityTags } from './model-capability-tags';
import { ModelPickerSearch } from './model-picker-search';
import { hubSearchFacets } from '@/lib/hub-search-facets';

type RepositoryModel = Pick<
  RegistryModel,
  'repository' | 'revision' | 'task' | 'gated' | 'downloads' | 'capability_tags' | 'model_facts'
>;

/** Use the model picker's token field and facets with facts reported by the Hub. */
export function ModelDownloadSearch({
  query,
  onQuery,
  onSearch,
  models,
  selected,
  onSelect,
  searching,
  error,
  tokens: controlledTokens,
  onTokensChange,
}: {
  query: string;
  onQuery: (query: string) => void;
  onSearch: () => void;
  models?: RepositoryModel[];
  selected: string;
  onSelect: (model: RepositoryModel) => void;
  searching: boolean;
  error?: Error | null;
  tokens?: string[];
  onTokensChange?: (tokens: string[]) => void;
}) {
  const [localTokens, setLocalTokens] = useState<string[]>([]);
  const tokens = controlledTokens ?? localTokens;
  const setTokens = (next: string[] | ((current: string[]) => string[])) => {
    const value = typeof next === 'function' ? next(tokens) : next;
    if (onTokensChange) onTokensChange(value);
    else setLocalTokens(value);
  };
  const [facetsOpen, setFacetsOpen] = useState(false);
  const entries = (models ?? []).map((model): FacetEntry => {
    const organization = model.repository.split('/')[0];
    const tags: ModelCapabilityTag[] = model.capability_tags
      ? registryModelTags(model)
      : model.task
        ? [
            {
              axis: 'task',
              value: model.task,
              hubTasks: [model.task],
              evidence: [{ source: 'hf_repo' }],
            },
          ]
        : [];
    const carried = modelFilterTokens(tags);
    carried.add(providerFilterToken(organization));
    return {
      providerId: organization,
      providerName: organization,
      tags,
      tokens: carried,
      facts: modelFactSummary(model.model_facts),
      matchesText: true,
    };
  });
  const visible = (models ?? []).filter((_, index) =>
    matchesFilterTokens(entries[index].tokens, tokens),
  );
  const loadedFacets = buildModelFacets(entries, tokens)
    .filter((tab) => tab.chipCount > 0)
    .map((tab) => (tab.id === 'providers' ? { ...tab, label: 'Organizations' } : tab));
  const facets = onTokensChange ? hubSearchFacets(loadedFacets, tokens) : loadedFacets;
  return (
    <div
      className="space-y-3"
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape' && facetsOpen) {
          event.preventDefault();
          event.stopPropagation();
          setFacetsOpen(false);
        }
      }}
    >
      <Field>
        <FieldLabel htmlFor="model-search" className="sr-only">
          Find on Hugging Face
        </FieldLabel>
        <div className="flex items-start gap-2">
          <ModelPickerSearch
            inputId="model-search"
            label="Find on Hugging Face"
            query={query}
            onQueryChange={onQuery}
            onSearch={onSearch}
            tokens={tokens}
            onTokensChange={setTokens}
            availableTokens={
              new Set([
                ...entries.flatMap((entry) => [...entry.tokens]),
                ...facets.flatMap((tab) =>
                  tab.groups.flatMap((group) => group.chips.map((chip) => chip.token)),
                ),
              ])
            }
            shown={visible.length}
            total={models?.length ?? 0}
            countScope="loaded"
            facetTabs={facets}
            facetsOpen={facetsOpen}
            onFacetsOpenChange={setFacetsOpen}
          />
        </div>
      </Field>
      {searching ? (
        <p role="status" className="text-sm text-muted-foreground">
          Searching models…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      ) : null}
      {models ? (
        <div
          className="max-h-[30dvh] overflow-y-auto divide-y border-y md:max-h-[55dvh]"
          aria-label="Model search results"
        >
          {!visible.length ? (
            <p className="py-3 text-sm text-muted-foreground">
              No matching repositories. Adjust the search or use Advanced download settings for an
              exact repository.
            </p>
          ) : (
            visible.map((model) => (
              <div
                key={model.repository}
                className="flex w-full items-center gap-3 px-2 py-3 text-left text-sm hover:bg-muted focus-visible:outline-ring"
              >
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    aria-pressed={selected === model.repository}
                    className="w-full break-words text-left font-medium hover:underline underline-offset-4"
                    onClick={() => {
                      setFacetsOpen(false);
                      onSelect(model);
                    }}
                  >
                    {model.repository}
                  </button>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {model.capability_tags ? (
                      <ModelCapabilityTags
                        size="sm"
                        tags={displayedTags(registryModelTags(model))}
                        onTagClick={(tag) =>
                          setTokens((previous) => [
                            ...new Set([...previous, ...modelFilterTokens([tag])]),
                          ])
                        }
                      />
                    ) : model.task ? (
                      <Badge variant="secondary">{hubTaskLabel(model.task)}</Badge>
                    ) : null}
                    {model.gated ? <Badge variant="outline">Requires access</Badge> : null}
                    {model.downloads != null ? (
                      <span>{model.downloads.toLocaleString()} downloads</span>
                    ) : null}
                  </div>
                </div>
                {selected === model.repository ? (
                  <CheckIcon className="size-4 text-primary" aria-label="Selected" />
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
