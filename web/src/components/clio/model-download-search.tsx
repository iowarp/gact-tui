import { useState, type ReactNode } from 'react';
import type { RegistryModel } from '@clio/core/v3';
import { CheckIcon, LockIcon } from 'lucide-react';
import { Field, FieldLabel } from '@/components/ui/field';
import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import { AddIcon } from '@/lib/icon-vocabulary';
import { formatBytes } from '@/lib/format';
import { cn } from '@/lib/utils';
import { buildModelFacets, hubTaskLabel, type FacetEntry } from '@/lib/model-facets';
import {
  matchesFilterTokens,
  modelFilterTokens,
  providerFilterToken,
} from '@/lib/model-filter-tokens';
import type { ModelCapabilityTag } from '@/lib/model-capability-tags';
import { displayedTags, modelCapabilityTagLabel } from '@/lib/model-capability-tags';
import { registryModelTags } from '@/lib/registry-model-tags';
import { modelFactSummary, parameterSizeLabel } from '@/lib/model-facts';
import { ModelPickerSearch } from './model-picker-search';
import { StateView } from './primitives/state-view';
import { hubSearchFacets } from '@/lib/hub-search-facets';

type RepositoryModel = Pick<
  RegistryModel,
  'repository' | 'revision' | 'task' | 'gated' | 'downloads' | 'capability_tags' | 'model_facts'
> & { size_bytes?: number | null };

const compactCount = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/**
 * One result as the spec's `.c3r` row reads it: the faint second line names
 * what the model does (its task and capability words) and how often it is
 * downloaded; the meta column says how big it is, by file size or parameters.
 */
function resultFacts(model: RepositoryModel) {
  const tags = model.capability_tags ? displayedTags(registryModelTags(model)) : [];
  const parameters = parameterSizeLabel(modelFactSummary(model.model_facts).parameters);
  const sizeTag = tags.find((tag) => tag.axis === 'size');
  const meta = model.size_bytes
    ? formatBytes(model.size_bytes)
    : (parameters ?? (sizeTag ? modelCapabilityTagLabel(sizeTag) : undefined));
  const words = model.capability_tags
    ? tags
        .filter((tag) => !(tag === sizeTag && meta === modelCapabilityTagLabel(tag)))
        .map(modelCapabilityTagLabel)
    : model.task
      ? [hubTaskLabel(model.task)]
      : [];
  const detail = [...words];
  const fullDetail = [...words];
  if (model.downloads != null) {
    detail.push(`${compactCount.format(model.downloads)} downloads`);
    fullDetail.push(`${model.downloads.toLocaleString()} downloads`);
  }
  if (model.gated) fullDetail.push('Requires access');
  return { meta, detail: detail.join(' · '), fullDetail: fullDetail.join(' · ') };
}

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
  heading,
  headingAction,
  loadMore,
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
  /** The group label over the results ("Popular text models on Hugging Face"). */
  heading?: string;
  /** A control at the group label's right (an ⓘ about the search). */
  headingAction?: ReactNode;
  /** More results exist: the list ends with a Load more row. */
  loadMore?: { onLoad: () => void; loading: boolean };
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
      className="flex min-h-0 min-w-0 flex-col gap-2.5"
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
          anchors
          searching={searching}
        />
      </Field>
      <div className="-mx-2 flex min-h-0 min-w-0 flex-1 flex-col">
        {heading ? (
          <div className="flex min-w-0 items-center gap-1.5 px-2 pt-1.5 pb-0.5 text-[11px] font-semibold whitespace-nowrap text-muted-foreground">
            <span className="min-w-0 truncate">{heading}</span>
            {headingAction}
          </div>
        ) : null}
        {searching ? <StateView kind="loading" size="row" title="Searching models…" /> : null}
        {error && !searching ? (
          <div title={error.message}>
            <StateView
              action={{ label: 'Retry', onClick: onSearch }}
              kind="error"
              size="row"
              title="The agent could not search Hugging Face."
            />
          </div>
        ) : null}
        {models ? (
          <div
            className="flex min-h-0 flex-1 flex-col overflow-y-auto"
            aria-label="Model search results"
          >
            {!visible.length ? (
              <StateView
                kind="empty"
                size="row"
                title="No models match. Change the search or the filters."
              />
            ) : (
              visible.map((model) => {
                const chosen = selected === model.repository;
                const { meta, detail, fullDetail } = resultFacts(model);
                return (
                  <div
                    key={model.repository}
                    className={cn(
                      'relative flex min-h-[30px] min-w-0 shrink-0 items-center gap-[9px] rounded-[6px] px-2 py-[3px] text-[12.5px] whitespace-nowrap has-[button:focus-visible]:ring-2 has-[button:focus-visible]:ring-ring/50',
                      chosen
                        ? 'bg-accent text-accent-foreground'
                        : 'text-foreground hover:bg-hover',
                    )}
                    title={fullDetail ? `${model.repository}\n${fullDetail}` : model.repository}
                  >
                    <ModelSelectorLogo
                      aria-hidden="true"
                      className={cn(
                        'size-[15px] rounded-none bg-transparent [&>span]:size-[15px]',
                        chosen ? 'text-accent-foreground' : 'text-muted-foreground',
                      )}
                      provider="huggingface"
                    />
                    <button
                      type="button"
                      aria-pressed={chosen}
                      className="flex min-w-0 flex-1 flex-col overflow-hidden text-left leading-[1.3] outline-none after:absolute after:inset-0 after:rounded-[6px]"
                      onClick={() => {
                        setFacetsOpen(false);
                        onSelect(model);
                      }}
                    >
                      <span className="truncate">{model.repository}</span>
                      {detail ? (
                        <small
                          className={cn(
                            'truncate text-[11px]',
                            chosen ? 'text-accent-foreground' : 'text-faint',
                          )}
                        >
                          {detail}
                        </small>
                      ) : null}
                    </button>
                    {/* Fixed columns (size | access, chosen) so every row's edge lines up. */}
                    <span className="relative ml-auto grid shrink-0 grid-cols-[58px_34px] items-center gap-x-2 pl-2">
                      <span
                        className={cn(
                          'truncate text-right text-[11px] tabular-nums',
                          chosen ? 'text-accent-foreground' : 'text-faint',
                        )}
                      >
                        {meta}
                      </span>
                      <span className="-mr-1 flex items-center justify-end gap-0.5">
                        {model.gated ? (
                          <span
                            role="img"
                            aria-label="Requires access"
                            title="Requires access"
                            className="grid size-4 place-items-center"
                          >
                            <LockIcon aria-hidden="true" className="size-3.5" />
                          </span>
                        ) : null}
                        {chosen ? (
                          <span
                            role="img"
                            aria-label="Selected"
                            title="Selected"
                            className="grid size-4 place-items-center"
                          >
                            <CheckIcon aria-hidden="true" className="size-3.5" />
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </div>
                );
              })
            )}
            {loadMore ? (
              <button
                type="button"
                disabled={loadMore.loading}
                className="flex min-h-[30px] w-full shrink-0 items-center gap-[9px] rounded-[6px] px-2 py-[3px] text-left text-[12.5px] whitespace-nowrap text-accent-foreground outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default disabled:hover:bg-transparent"
                onClick={loadMore.onLoad}
              >
                <AddIcon aria-hidden="true" className="size-[15px] shrink-0" />
                {loadMore.loading ? 'Loading…' : 'Load more models'}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
