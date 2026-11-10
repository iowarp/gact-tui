import { vocab } from '@/lib/brand-vocabulary';
import type { ManagedServiceCatalog, ModelAcquisition, ModelDownloadInput } from '@clio/core/v3';
import { useEffect, useState, type ReactNode } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  DownloadIcon,
  HardDriveIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useRepository } from '@/hooks/use-repository';
import { useInfrastructureState } from '@/hooks/use-infrastructure-state';
import { useConnectionSettings } from '@/providers/connection-provider';
import { formatBytes } from '@/lib/format';
import { DIALOG_FULL_WINDOW_CLASS } from '@/lib/dialog-sheet';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { CloseIcon } from '@/lib/icon-vocabulary';
import { InfoTip } from './info-tip';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { MenuRow } from './primitives/menu-row';
import { HostPathPicker } from './host-path-picker';
import { ShortcutKeys } from './primitives/key-chip';
import { installExpectation } from './install-expectation-model';
import { ModelDownloadSearch } from './model-download-search';
import { ModelInventoryRow } from './model-inventory-row';
import { ModelDownloadProgress } from './model-download-progress';
import { ModelStorageLocations } from './model-storage-locations';
import { RegistryModelDetails } from './registry-model-details';
import { InfraList } from './infrastructure-row';
import { InfraTabActions } from './infrastructure-tab-actions';
import { StateView } from './primitives/state-view';
import { SourceStatusLine, sourceInputClass } from './source-form-parts';

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

/** Spec `.c3s` under the facts: whether the chosen model fits the host's free space. */
function FreeSpaceLine({
  freeBytes,
  sizeBytes,
  hostLabel,
  path,
}: {
  freeBytes: number;
  sizeBytes?: number | null;
  hostLabel: string;
  path: string;
}) {
  const free = `${formatBytes(freeBytes)} free on ${hostLabel}`;
  const tone = !sizeBytes ? 'default' : sizeBytes <= freeBytes ? 'ok' : 'warning';
  return (
    <div title={`Free space in ${path}`}>
      <SourceStatusLine
        icon={
          tone === 'ok' ? (
            <CheckIcon />
          ) : tone === 'warning' ? (
            <TriangleAlertIcon />
          ) : (
            <HardDriveIcon />
          )
        }
        tone={tone}
      >
        {tone === 'ok'
          ? `Fits: ${free}.`
          : tone === 'warning'
            ? `Needs ${formatBytes(sizeBytes ?? 0)}; only ${free}.`
            : `${free}.`}
      </SourceStatusLine>
    </div>
  );
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
  const downloadBlocked =
    acquire.isPending || Boolean(unavailable) || !draft.repository.trim() || !draft.revision.trim();
  const downloadEstimate = {
    downloadBytes: chosen?.size_bytes,
    thing: draft.repository.trim() || 'the model files',
  };
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
          showCloseButton={false}
          className={cn(
            // Spec `.c3d`: 56% of the window, centred; the details go below the list under 900 px.
            'flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 min-[600px]:top-1/2 min-[600px]:-translate-y-1/2 sm:w-[clamp(560px,56vw,1040px)] sm:max-w-[calc(100%-2rem)]',
            // A fixed height while choosing, so loading results never moves the frame.
            !acquire.data && 'min-[600px]:h-[min(640px,calc(100dvh-2rem))]',
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
          <div className="flex h-12 min-w-0 shrink-0 items-center gap-2.5 pr-2.5 pl-4">
            <DialogTitle className="min-w-0 flex-1 truncate font-sans text-[14px] leading-7 font-semibold">
              {acquire.data ? 'Model download' : 'Find a model'}
            </DialogTitle>
            {acquire.data ? null : (
              <InfoTip className="size-7" label="About model downloads">
                Download the repository's files into a dedicated folder on this host. {vocab.agent}{' '}
                resolves an immutable revision, checks free space, and verifies the files. This does
                not load model code or start inference.
              </InfoTip>
            )}
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close"
                title="Close"
                disabled={acquire.isPending}
                className="shrink-0 text-muted-foreground"
              >
                <CloseIcon aria-hidden="true" />
              </Button>
            </DialogClose>
          </div>
          <DialogDescription className="-mt-1.5 shrink-0 truncate px-4 pb-[13px] text-[11.5px] text-faint">
            {acquire.data
              ? 'Progress continues if you close this window.'
              : `Choose a model to download to ${hostLabel}.`}
          </DialogDescription>
          {acquire.data ? (
            <>
              <div className="flex min-h-0 flex-col gap-[13px] overflow-y-auto px-4 pb-3.5">
                <p className="truncate text-[12.5px] font-semibold" title={acquire.data.repository}>
                  {acquire.data.repository}
                </p>
                <ModelDownloadProgress
                  model={
                    inventory.data?.models.find((row) => row.id === acquire.data.id) ?? acquire.data
                  }
                />
              </div>
              <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border py-2.5 pr-3 pl-4">
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
            </>
          ) : (
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                acquire.mutate();
              }}
              // Ctrl+Enter (⌘↩) downloads from anywhere in the chooser, as the button's key shows.
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.shiftKey) return;
                if (!(event.ctrlKey || event.metaKey) || downloadBlocked) return;
                event.preventDefault();
                acquire.mutate();
              }}
            >
              <div className="grid min-h-0 flex-1 auto-rows-min gap-x-4 gap-y-[13px] overflow-y-auto px-4 pb-3.5 max-[899px]:grid-rows-[minmax(14rem,1fr)_auto] min-[900px]:grid-cols-[calc(48%-8px)_calc(52%-8px)] min-[900px]:grid-rows-[minmax(0,1fr)] min-[900px]:overflow-hidden">
                <ModelDownloadSearch
                  heading={
                    submittedSearch
                      ? `Results for “${submittedSearch}”`
                      : searchFilters.length
                        ? 'Models on Hugging Face'
                        : 'Popular text models on Hugging Face'
                  }
                  headingAction={
                    <InfoTip className="size-5" label="About model search">
                      Search uses Hugging Face tags. Capability filters also check the evidence in
                      loaded results; unknown capabilities are not assumed. Counts refer to loaded
                      results. Load more to continue searching.
                    </InfoTip>
                  }
                  loadMore={
                    found.hasNextPage
                      ? {
                          onLoad: () => void found.fetchNextPage(),
                          loading: found.isFetchingNextPage,
                        }
                      : undefined
                  }
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
                  searching={found.isFetching && !found.isFetchingNextPage}
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
                {/* Spec `.c3pane`: the chosen model's facts, then the download settings. */}
                <div className="flex min-h-0 min-w-0 flex-col gap-[13px] border-border max-[899px]:border-t max-[899px]:pt-3 min-[900px]:overflow-y-auto min-[900px]:border-l min-[900px]:pl-4">
                  {draft.repository ? (
                    <RegistryModelDetails
                      repository={draft.repository}
                      compact
                      sizeBytes={chosen?.size_bytes}
                      task={chosen?.task}
                    />
                  ) : (
                    <p className="py-1.5 text-[12px] text-pretty text-faint">
                      Choose a model to see its capabilities and model card.
                    </p>
                  )}
                  {draft.repository && capacity.data ? (
                    <FreeSpaceLine
                      freeBytes={capacity.data.free_bytes}
                      hostLabel={hostLabel}
                      path={capacity.data.path}
                      sizeBytes={chosen?.size_bytes}
                    />
                  ) : null}
                  <Collapsible
                    className="group/advanced -mx-2 flex min-w-0 flex-col"
                    open={advancedOpen}
                    onOpenChange={setAdvancedOpen}
                  >
                    <CollapsibleTrigger className="flex min-h-[30px] w-full cursor-pointer items-center gap-[9px] rounded-[6px] px-2 py-[3px] text-left text-[12.5px] whitespace-nowrap text-foreground outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring/50">
                      <span
                        aria-hidden="true"
                        className="grid w-3 shrink-0 place-items-center text-faint"
                      >
                        <ChevronRightIcon className="size-3 group-data-[state=open]/advanced:rotate-90 motion-safe:transition-transform" />
                      </span>
                      Advanced download settings
                    </CollapsibleTrigger>
                    <CollapsibleContent className="flex min-w-0 flex-col gap-[13px] px-2 pt-1.5">
                      <div className="grid min-w-0 grid-cols-2 gap-2.5">
                        <div className="flex min-w-0 flex-col gap-[5px]">
                          <label
                            htmlFor="model-repository"
                            className="flex min-h-5 items-center text-[11.5px] whitespace-nowrap text-muted-foreground"
                          >
                            Repository
                          </label>
                          <Input
                            id="model-repository"
                            required
                            className={cn(sourceInputClass, 'font-mono text-[12px] md:text-[12px]')}
                            value={draft.repository}
                            placeholder="organization/model"
                            onChange={(event) =>
                              setDraft({ ...draft, repository: event.target.value })
                            }
                          />
                        </div>
                        <div className="flex min-w-0 flex-col gap-[5px]">
                          <div className="flex min-h-5 items-center gap-1.5">
                            <label
                              htmlFor="model-revision"
                              className="text-[11.5px] whitespace-nowrap text-muted-foreground"
                            >
                              Revision
                            </label>
                            <InfoTip className="size-5" label="About model revisions">
                              A branch or tag is resolved once to a commit. Retries keep that same
                              commit even if the branch changes.
                            </InfoTip>
                          </div>
                          <Input
                            id="model-revision"
                            required
                            className={cn(sourceInputClass, 'font-mono text-[12px] md:text-[12px]')}
                            value={draft.revision}
                            onChange={(event) =>
                              setDraft({ ...draft, revision: event.target.value })
                            }
                          />
                        </div>
                      </div>
                      <div className="flex min-w-0 flex-col gap-[5px]">
                        <div className="flex min-h-5 min-w-0 items-center gap-1.5">
                          <label
                            htmlFor="model-destination"
                            className="truncate text-[11.5px] whitespace-nowrap text-muted-foreground"
                          >
                            Destination on {hostLabel}
                          </label>
                          <InfoTip className="size-5" label="About model destination">
                            Choose a dedicated empty folder, or leave this blank to create one under
                            this host's configured Models folder. Existing downloads retain their
                            original paths when settings change.
                          </InfoTip>
                        </div>
                        <div className="flex min-w-0 items-center gap-1.5">
                          <Input
                            id="model-destination"
                            className={cn(
                              sourceInputClass,
                              'min-w-0 flex-1 font-mono text-[12px] md:text-[12px]',
                            )}
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
                            triggerClassName="h-[30px] shrink-0 px-2 text-[12px] text-muted-foreground"
                          />
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                  {acquire.error ? (
                    <SourceStatusLine icon={<CircleAlertIcon />} role="alert" tone="error">
                      {acquire.error.message}
                    </SourceStatusLine>
                  ) : null}
                </div>
              </div>
              {/* Spec `.df`: the download size at the left, then Cancel and Download. */}
              <div className="flex shrink-0 items-center gap-2 border-t border-border py-2.5 pr-3 pl-4">
                <p
                  className={cn(
                    'mr-auto min-w-0 truncate text-[11.5px] whitespace-nowrap text-faint',
                    // The hint gives way on a phone; a known size always shows.
                    !chosen?.size_bytes && 'max-[599px]:invisible',
                  )}
                  data-slot="download-size-note"
                  title={installExpectation(downloadEstimate)}
                >
                  {chosen?.size_bytes
                    ? `${formatBytes(chosen.size_bytes)} to download`
                    : 'Progress continues if you close this window'}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={acquire.isPending}
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="gap-[7px] bg-clip-border"
                  disabled={downloadBlocked}
                >
                  <DownloadIcon aria-hidden="true" />
                  {acquire.isPending ? 'Starting download…' : `Download to ${hostLabel}`}
                  {downloadBlocked ? null : (
                    <span aria-hidden="true" className="inline-flex max-[599px]:hidden">
                      <ShortcutKeys
                        className="border-current/45"
                        keys={['Ctrl+Enter']}
                        variant="inline"
                      />
                    </span>
                  )}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
