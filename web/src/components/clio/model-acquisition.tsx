import { vocab } from '@/lib/brand-vocabulary';
import type { ManagedServiceCatalog, ModelAcquisition, ModelDownloadInput } from '@clio/core/v3';
import { useEffect, useState, type ReactNode } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRightIcon, DownloadIcon, HardDriveIcon } from 'lucide-react';
import { useRepository } from '@/hooks/use-repository';
import { useInfrastructureState } from '@/hooks/use-infrastructure-state';
import { useConnectionSettings } from '@/providers/connection-provider';
import { formatBytes } from '@/lib/format';
import { DIALOG_FULL_WINDOW_CLASS } from '@/lib/dialog-sheet';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { InfoTip } from './info-tip';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { MenuRow } from './primitives/menu-row';
import { HostPathPicker } from './host-path-picker';
import { InstallExpectation } from './install-expectation';
import { ModelDownloadSearch } from './model-download-search';
import { ModelInventoryRow } from './model-inventory-row';
import { ModelDownloadProgress } from './model-download-progress';
import { ModelStorageLocations } from './model-storage-locations';
import { RegistryModelDetails } from './registry-model-details';
import { InfraList } from './infrastructure-row';
import { InfraTabActions } from './infrastructure-tab-actions';
import { StateView } from './primitives/state-view';

const initial: ModelDownloadInput = { repository: '', revision: 'main', destination: '' };

/** The runtime that serves a model's files on this computer, or the one it lacks. */
function modelRuntime(
  model: ModelAcquisition,
  catalog: ManagedServiceCatalog | undefined,
  hostLabel: string,
): { runtime?: string; unavailable?: string } {
  if (!catalog) return {};
  const gguf = Boolean(model.file_path?.endsWith('.gguf'));
  const usable = (id: string) =>
    catalog.services.find(
      (service) => service.id === id && service.variants.some((variant) => variant.compatible),
    );
  const compatible = (gguf ? usable('llama_cpp') : undefined) ?? usable('vllm');
  if (compatible) return { runtime: compatible.label };
  return {
    runtime: catalog.services.find((service) => service.id === (gguf ? 'llama_cpp' : 'vllm'))
      ?.label,
    unavailable: `No compatible runtime for these files on ${hostLabel}. Transformers models need a supported vLLM computer; llama.cpp needs a GGUF file.`,
  };
}

/** Host-owned acquisition remains visible after navigation and controller restarts. */
export function ModelAcquisitions({
  targetId,
  hostLabel,
  hostSelector,
}: {
  targetId: string;
  hostLabel: string;
  /** The computer selector, drawn before Download model in the tab bar. */
  hostSelector?: ReactNode;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const client = useQueryClient();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const key = ['model-acquisitions', settings.endpoint, targetId];
  const [open, setOpen] = useInfrastructureState(
    settings.endpoint,
    `${targetId}:download-open`,
    false,
  );
  const [draft, setDraft] = useInfrastructureState(
    settings.endpoint,
    `${targetId}:download-draft`,
    initial,
  );
  const [search, setSearch] = useInfrastructureState(
    settings.endpoint,
    `${targetId}:model-search`,
    '',
  );
  const [submittedSearch, setSubmittedSearch] = useInfrastructureState(
    settings.endpoint,
    `${targetId}:model-search-submitted`,
    '',
  );
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setSubmittedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search, open, setSubmittedSearch]);
  const inventory = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => repository.modelInventory(targetId, signal),
    staleTime: 10_000,
    refetchInterval: (query) =>
      query.state.data?.models.some(
        (model) => model.state === 'running' || model.state === 'queued',
      )
        ? 1500
        : false,
    retry: false,
  });
  const runtimes = useQuery({
    queryKey: ['managed-service-catalog', settings.endpoint, targetId],
    queryFn: ({ signal }) => repository.managedServiceCatalog(targetId, signal),
    staleTime: 30_000,
    retry: false,
  });
  const storage = useQuery({
    queryKey: ['host-storage', settings.endpoint, targetId],
    queryFn: ({ signal }) => repository.hostStorageSettings(targetId, signal),
    retry: false,
  });
  const modelsFolder = storage.data?.effective.models ?? '';
  const capacity = useQuery({
    enabled: Boolean(modelsFolder),
    queryKey: ['host-storage-capacity', settings.endpoint, targetId, modelsFolder],
    queryFn: ({ signal }) => repository.inspectHostPath(targetId, { path: modelsFolder }, signal),
    staleTime: 60_000,
    retry: false,
  });
  const [searchFilters, setSearchFilters] = useInfrastructureState<string[]>(
    settings.endpoint,
    `${targetId}:model-search-filters`,
    [],
  );
  const found = useInfiniteQuery({
    queryKey: ['model-search', settings.endpoint, submittedSearch, searchFilters],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) =>
      repository.searchModelsPage(
        { query: submittedSearch, cursor: pageParam, filters: searchFilters },
        signal,
      ),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    enabled: open,
    retry: false,
  });
  const selectedDetails = useQuery({
    queryKey: ['registry-model-details', settings.endpoint, draft.repository],
    queryFn: ({ signal }) => repository.modelRegistryDetails(draft.repository, signal),
    enabled: open && Boolean(draft.repository),
    staleTime: 30 * 60_000,
    retry: false,
  });
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: key }),
      client.invalidateQueries({ queryKey: ['infrastructure-inventory', settings.endpoint] }),
    ]);
  };
  const acquire = useMutation({
    mutationFn: () => repository.acquireModel(targetId, draft),
    onSuccess: async () => {
      await refresh();
    },
  });
  const action = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'retry' | 'cancel' }) =>
      repository.modelAcquisitionAction(targetId, id, action),
    onSuccess: refresh,
  });
  const chosen = found.data?.pages
    .flatMap((page) => page.models)
    .find((model) => model.repository === draft.repository.trim());
  const error = inventory.error ?? acquire.error ?? action.error;
  const unavailable = inventory.data?.unavailable_reason;
  const models = inventory.data?.models ?? [];
  const startDownload = () => {
    acquire.reset();
    setOpen(true);
  };
  const downloadDisabled = !inventory.data || Boolean(unavailable);
  return (
    <div className="flex min-w-0 flex-col">
      <InfraTabActions
        fold={{
          label: 'More model actions',
          verb: (
            <>
              <Button size="sm" disabled={downloadDisabled} onClick={startDownload}>
                <DownloadIcon /> Download model
              </Button>
              {unavailable ? (
                <InfoTip label="Why downloading is unavailable">{unavailable}</InfoTip>
              ) : null}
            </>
          ),
          menu: (
            <DropdownMenuItem disabled={downloadDisabled} onSelect={startDownload}>
              <MenuRow
                description={unavailable ?? undefined}
                icon={<DownloadIcon />}
                label="Download model"
              />
            </DropdownMenuItem>
          ),
        }}
      >
        {hostSelector}
      </InfraTabActions>
      {error ? (
        <StateView
          action={
            inventory.error
              ? { label: 'Retry', onClick: () => void inventory.refetch() }
              : undefined
          }
          kind="error"
          size="row"
          title={error.message}
        />
      ) : null}
      {inventory.data?.errors.map((failure) => (
        <StateView
          action={{ label: 'Retry', onClick: () => void inventory.refetch() }}
          detail={failure.error}
          key={failure.storage_root}
          kind="error"
          size="row"
          title={`Could not inspect ${failure.storage_root}. Showing the last observation.`}
        />
      ))}
      <InfraList
        heading={`Downloaded models on ${hostLabel}`}
        headingAction={
          capacity.data ? (
            <span
              className="flex items-center gap-1 text-[11.5px] text-muted-foreground"
              title={`Free space in ${capacity.data.path}`}
            >
              <HardDriveIcon aria-hidden="true" className="size-3.5" />
              {`${formatBytes(capacity.data.free_bytes)} free`}
            </span>
          ) : undefined
        }
        hover={78}
        meta={96}
        status={136}
      >
        {inventory.isPending ? (
          <div role="listitem">
            <StateView kind="loading" size="row" title="Inspecting model storage…" />
          </div>
        ) : inventory.data && !models.length ? (
          <div role="listitem">
            <StateView kind="empty" size="row" title="No downloaded models on this host yet." />
          </div>
        ) : null}
        {models.map((model) => {
          const { runtime, unavailable: runtimeUnavailable } = modelRuntime(
            model,
            runtimes.data,
            hostLabel,
          );
          return (
            <ModelInventoryRow
              key={model.id}
              model={model}
              targetId={targetId}
              hostLabel={hostLabel}
              runtime={runtime}
              runtimeUnavailable={runtimeUnavailable}
              disabled={action.isPending || Boolean(unavailable)}
              onAction={(next) => action.mutate({ id: model.id, action: next })}
              onRefresh={refresh}
            />
          );
        })}
      </InfraList>
      <ModelStorageLocations hostLabel={hostLabel} targetId={targetId} />
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!acquire.isPending) setOpen(value);
        }}
      >
        <DialogContent
          className={cn(
            // Spec: 56% of the window; the details go below the list under 900 px.
            'flex max-h-[90dvh] flex-col overflow-hidden sm:w-[clamp(560px,56vw,1040px)] sm:max-w-[calc(100%-2rem)]',
            DIALOG_FULL_WINDOW_CLASS,
          )}
          // Search first, as the spec pickers do, rather than the title's info tip.
          onOpenAutoFocus={(event) => {
            const search = (event.currentTarget as HTMLElement).querySelector('input');
            if (!search) return;
            event.preventDefault();
            search.focus();
          }}
        >
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>{acquire.data ? 'Model download' : 'Find a model'}</DialogTitle>
              {acquire.data ? null : (
                <InfoTip label="About model downloads">
                  Download the repository's files into a dedicated folder on this host.{' '}
                  {vocab.agent} resolves an immutable revision, checks free space, and verifies the
                  files. This does not load model code or start inference.
                </InfoTip>
              )}
            </div>
            <DialogDescription>
              {acquire.data
                ? 'Progress continues if you close this window.'
                : `Choose a model to download to ${hostLabel}.`}
            </DialogDescription>
          </DialogHeader>
          {acquire.data ? (
            <div className="space-y-5">
              <p className="font-medium">{acquire.data.repository}</p>
              <ModelDownloadProgress
                model={
                  inventory.data?.models.find((row) => row.id === acquire.data.id) ?? acquire.data
                }
              />
              <div className="flex justify-end">
                <Button onClick={() => setOpen(false)}>
                  {['queued', 'running'].includes(
                    (
                      inventory.data?.models.find((row) => row.id === acquire.data.id) ??
                      acquire.data
                    ).state,
                  )
                    ? 'Continue in background'
                    : 'Done'}
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="flex min-h-0 flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                acquire.mutate();
              }}
            >
              <div className="grid min-h-0 gap-6 overflow-y-auto pr-1 min-[900px]:grid-cols-2 min-[900px]:overflow-hidden">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <p>
                      {submittedSearch
                        ? `Results for “${submittedSearch}”`
                        : searchFilters.length
                          ? 'Models on Hugging Face'
                          : 'Popular text models on Hugging Face'}
                    </p>
                    <InfoTip label="About model search">
                      Search uses Hugging Face tags. Capability filters also check the evidence in
                      loaded results; unknown capabilities are not assumed. Counts refer to loaded
                      results. Load more to continue searching.
                    </InfoTip>
                  </div>
                  <ModelDownloadSearch
                    tokens={searchFilters}
                    onTokensChange={setSearchFilters}
                    query={search}
                    onQuery={setSearch}
                    onSearch={() => setSubmittedSearch(search.trim())}
                    models={found.data?.pages
                      .flatMap((page) => page.models)
                      .filter(
                        (model, index, all) =>
                          all.findIndex((other) => other.repository === model.repository) === index,
                      )
                      .map((model) =>
                        selectedDetails.data?.repository === model.repository
                          ? {
                              ...model,
                              capability_tags: selectedDetails.data.capability_tags,
                              model_facts: selectedDetails.data.model_facts,
                            }
                          : model,
                      )}
                    searching={found.isFetching}
                    error={found.error}
                    selected={draft.repository}
                    onSelect={(model) =>
                      setDraft((old) => ({
                        ...old,
                        repository: model.repository,
                        revision: model.revision || 'main',
                      }))
                    }
                  />
                  {found.hasNextPage ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={found.isFetchingNextPage}
                      onClick={() => void found.fetchNextPage()}
                    >
                      {found.isFetchingNextPage ? 'Loading…' : 'Load more models'}
                    </Button>
                  ) : null}
                </div>
                <div className="min-h-0 space-y-4 min-[900px]:max-h-[65dvh] min-[900px]:overflow-y-auto min-[900px]:border-l min-[900px]:pl-6">
                  {draft.repository ? (
                    <>
                      <p className="break-all font-semibold">{draft.repository}</p>
                      <RegistryModelDetails repository={draft.repository} compact />
                    </>
                  ) : (
                    <p className="py-8 text-sm text-muted-foreground">
                      Choose a model to see its capabilities and model card.
                    </p>
                  )}
                  <Collapsible
                    className="border-t pt-3"
                    open={advancedOpen}
                    onOpenChange={setAdvancedOpen}
                  >
                    <CollapsibleTrigger className="group/advanced flex items-center gap-1.5 text-sm font-medium">
                      <ChevronRightIcon
                        aria-hidden="true"
                        className="size-3.5 text-muted-foreground transition-transform group-data-[state=open]/advanced:rotate-90 motion-reduce:transition-none"
                      />
                      Advanced download settings
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-4 space-y-4">
                      <Field>
                        <FieldLabel htmlFor="model-repository">Repository</FieldLabel>
                        <Input
                          id="model-repository"
                          required
                          value={draft.repository}
                          placeholder="organization/model"
                          onChange={(event) =>
                            setDraft({ ...draft, repository: event.target.value })
                          }
                        />
                      </Field>
                      <Field>
                        <div className="flex items-center gap-2">
                          <FieldLabel htmlFor="model-revision">Revision</FieldLabel>
                          <InfoTip label="About model revisions">
                            A branch or tag is resolved once to a commit. Retries keep that same
                            commit even if the branch changes.
                          </InfoTip>
                        </div>
                        <Input
                          id="model-revision"
                          required
                          value={draft.revision}
                          onChange={(event) => setDraft({ ...draft, revision: event.target.value })}
                        />
                      </Field>
                      <Field>
                        <div className="flex items-center gap-2">
                          <FieldLabel htmlFor="model-destination">
                            Destination on {hostLabel}
                          </FieldLabel>
                          <InfoTip label="About model destination">
                            Choose a dedicated empty folder, or leave this blank to create one under
                            this host's configured Models folder. Existing downloads retain their
                            original paths when settings change.
                          </InfoTip>
                        </div>
                        <div className="flex gap-2">
                          <Input
                            id="model-destination"
                            value={draft.destination}
                            placeholder={`${storage.data?.effective.models || 'Models folder'}/repository--revision`}
                            onChange={(event) =>
                              setDraft({ ...draft, destination: event.target.value })
                            }
                          />
                          <HostPathPicker
                            targetId={targetId}
                            hostLabel={hostLabel}
                            label="Model destination"
                            path={draft.destination || storage.data?.effective.models || ''}
                            onChoose={(destination) => setDraft({ ...draft, destination })}
                          />
                        </div>
                      </Field>
                    </CollapsibleContent>
                  </Collapsible>
                  {acquire.error ? (
                    <StateView kind="error" size="row" title={acquire.error.message} />
                  ) : null}
                  <InstallExpectation
                    downloadBytes={chosen?.size_bytes}
                    thing={draft.repository.trim() || 'the model files'}
                  />
                </div>
              </div>
              <div className="mt-4 flex shrink-0 justify-end gap-2 border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  disabled={acquire.isPending}
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    acquire.isPending ||
                    Boolean(unavailable) ||
                    !draft.repository.trim() ||
                    !draft.revision.trim()
                  }
                >
                  {acquire.isPending ? 'Starting download…' : `Download to ${hostLabel}`}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
