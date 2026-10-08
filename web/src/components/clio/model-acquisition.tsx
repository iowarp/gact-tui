import { vocab } from '@/lib/brand-vocabulary';
import type { ModelAcquisition, ModelDownloadInput } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DownloadIcon, PackageCheckIcon, SearchIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useRepository } from '@/hooks/use-repository';
import { useInfrastructureState } from '@/hooks/use-infrastructure-state';
import { useConnectionSettings } from '@/providers/connection-provider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { InfoTip } from './info-tip';
import { HostPathPicker } from './host-path-picker';
import { InstallExpectation } from './install-expectation';

const initial: ModelDownloadInput = { repository: '', revision: 'main', destination: '' };
const size = (bytes: number) =>
  `${(bytes / 1024 ** 2).toLocaleString(undefined, { maximumFractionDigits: 1 })} MiB`;

/** Host-owned acquisition remains visible after navigation and controller restarts. */
export function ModelAcquisitions({
  targetId,
  hostLabel,
}: {
  targetId: string;
  hostLabel: string;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const client = useQueryClient();
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
  const inventory = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => repository.modelInventory(targetId, signal),
    refetchInterval: 5000,
    retry: false,
  });
  const storage = useQuery({
    queryKey: ['host-storage', settings.endpoint, targetId],
    queryFn: ({ signal }) => repository.hostStorageSettings(targetId, signal),
    retry: false,
  });
  const found = useQuery({
    queryKey: ['model-search', settings.endpoint, submittedSearch],
    queryFn: ({ signal }) => repository.searchModels(submittedSearch, signal),
    enabled: open && Boolean(submittedSearch),
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
      setOpen(false);
      await refresh();
    },
  });
  const action = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'retry' | 'cancel' }) =>
      repository.modelAcquisitionAction(targetId, id, action),
    onSuccess: refresh,
  });
  const chosen = found.data?.models.find((model) => model.repository === draft.repository.trim());
  const error = inventory.error ?? acquire.error ?? action.error;
  const unavailable = inventory.data?.unavailable_reason;
  return (
    <section className="rounded-lg border" aria-label={`Models on ${hostLabel}`}>
      <div className="flex flex-wrap items-center gap-3 border-b p-4">
        <PackageCheckIcon className="size-5 text-primary" aria-hidden="true" />
        <h3 className="font-medium">Models</h3>
        <InfoTip label="About model downloads">
          Download the repository's files into a dedicated folder on this host. {vocab.agent}{' '}
          resolves an immutable revision, checks free space, and verifies the files. This does not
          load model code or start inference.
        </InfoTip>
        <span className="text-sm text-muted-foreground">{hostLabel}</span>
        <Button
          className="ml-auto"
          size="sm"
          disabled={!inventory.data || Boolean(unavailable)}
          onClick={() => {
            acquire.reset();
            setOpen(true);
          }}
        >
          <DownloadIcon /> Download model
        </Button>
        {unavailable ? (
          <InfoTip label="Why downloading is unavailable">{unavailable}</InfoTip>
        ) : null}
      </div>
      {inventory.isPending ? (
        <p role="status" className="p-4 text-sm text-muted-foreground">
          Inspecting model storage…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="p-4 text-sm text-destructive">
          {error.message}
        </p>
      ) : null}
      {inventory.data?.errors.map((error) => (
        <p role="alert" className="p-4 text-sm text-destructive" key={error.storage_root}>
          Could not inspect {error.storage_root}: {error.error}. Showing the last observation.
        </p>
      ))}
      {inventory.data && !inventory.data.models.length ? (
        <div className="space-y-2 p-6 text-sm text-muted-foreground">
          <p>No downloaded models on this host yet.</p>
          <p>Prepare the files here, then configure a runtime in Services.</p>
        </div>
      ) : null}
      <div className="divide-y">
        {inventory.data?.models.map((model) => (
          <ModelRow
            key={model.id}
            model={model}
            targetId={targetId}
            disabled={action.isPending || Boolean(unavailable)}
            onAction={(next) => action.mutate({ id: model.id, action: next })}
          />
        ))}
      </div>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!acquire.isPending) setOpen(value);
        }}
      >
        <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Download a model</DialogTitle>
            <DialogDescription>Files will be stored on {hostLabel}.</DialogDescription>
          </DialogHeader>
          <form
            className="clio-scrollbar space-y-5 overflow-y-auto pr-1"
            onSubmit={(event) => {
              event.preventDefault();
              acquire.mutate();
            }}
          >
            <Field>
              <FieldLabel htmlFor="model-search">Find on Hugging Face</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="model-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      setSubmittedSearch(search.trim());
                    }
                  }}
                  placeholder="Model name or organization"
                />
                <Button
                  type="button"
                  variant="outline"
                  aria-label="Search models"
                  disabled={!search.trim() || found.isFetching}
                  onClick={() => setSubmittedSearch(search.trim())}
                >
                  <SearchIcon />
                </Button>
              </div>
            </Field>
            {found.isFetching ? (
              <p role="status" className="text-sm text-muted-foreground">
                Searching models…
              </p>
            ) : null}
            {found.error ? (
              <p role="alert" className="text-sm text-destructive">
                {found.error.message}
              </p>
            ) : null}
            {found.data ? (
              <div
                className="max-h-44 overflow-y-auto rounded border"
                aria-label="Model search results"
              >
                {!found.data.models.length ? (
                  <p className="p-3 text-sm text-muted-foreground">
                    No matching repositories. Enter an exact repository below.
                  </p>
                ) : (
                  found.data.models.map((model) => (
                    <button
                      key={model.repository}
                      type="button"
                      className="flex w-full items-start justify-between gap-3 border-b p-3 text-left text-sm last:border-0 hover:bg-muted focus-visible:outline-ring"
                      onClick={() =>
                        setDraft((old) => ({
                          ...old,
                          repository: model.repository,
                          revision: model.revision || 'main',
                        }))
                      }
                    >
                      <span className="min-w-0 break-all font-medium">{model.repository}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {model.gated ? 'Requires access' : model.task?.replaceAll('-', ' ')}
                      </span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
            <Field>
              <FieldLabel htmlFor="model-repository">Repository</FieldLabel>
              <Input
                id="model-repository"
                required
                value={draft.repository}
                placeholder="organization/model"
                onChange={(event) => setDraft({ ...draft, repository: event.target.value })}
              />
            </Field>
            <Field>
              <div className="flex items-center gap-2">
                <FieldLabel htmlFor="model-revision">Revision</FieldLabel>
                <InfoTip label="About model revisions">
                  A branch or tag is resolved once to a commit. Retries keep that same commit even
                  if the branch changes.
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
                <FieldLabel htmlFor="model-destination">Destination on {hostLabel}</FieldLabel>
                <InfoTip label="About model destination">
                  Choose a dedicated empty folder, or leave this blank to create one under this
                  host's configured Models folder. Existing downloads retain their original paths
                  when settings change.
                </InfoTip>
              </div>
              <div className="flex gap-2">
                <Input
                  id="model-destination"
                  value={draft.destination}
                  placeholder={`${storage.data?.effective.models || 'Models folder'}/repository--revision`}
                  onChange={(event) => setDraft({ ...draft, destination: event.target.value })}
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
            {acquire.error ? (
              <p role="alert" className="text-sm text-destructive">
                {acquire.error.message}
              </p>
            ) : null}
            <InstallExpectation
              downloadBytes={chosen?.size_bytes}
              thing={draft.repository.trim() || 'the model files'}
            />
            <div className="flex justify-end gap-2">
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
                {acquire.isPending ? 'Starting download…' : 'Download to host'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ModelRow({
  model,
  targetId,
  disabled,
  onAction,
}: {
  model: ModelAcquisition;
  targetId: string;
  disabled: boolean;
  onAction: (action: 'retry' | 'cancel') => void;
}) {
  const active = ['queued', 'running'].includes(model.state);
  return (
    <article className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 break-all font-medium">{model.repository}</span>
        <Badge variant="outline">{model.state === 'ready' ? 'Files verified' : model.state}</Badge>
        <div className="ml-auto flex gap-2">
          {active ? (
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => onAction('cancel')}
            >
              Cancel download
            </Button>
          ) : model.state !== 'ready' ? (
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => onAction('retry')}
            >
              Retry
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline">
              <Link
                to={`/infrastructure/services?target=${encodeURIComponent(targetId)}&model=${encodeURIComponent(model.id)}`}
              >
                Set up runtime
              </Link>
            </Button>
          )}
        </div>
      </div>
      <p
        className={`text-sm ${model.error ? 'text-destructive' : 'text-muted-foreground'}`}
        role={model.error ? 'alert' : undefined}
      >
        {model.error || model.phase}
      </p>
      {active ? (
        <div className="space-y-1">
          <progress
            className="h-2 w-full accent-primary"
            aria-label={`Downloaded bytes for ${model.repository}`}
            value={model.bytes_done}
            max={model.bytes_total || 1}
          />
          <p className="text-xs tabular-nums text-muted-foreground">
            {size(model.bytes_done)}
            {model.bytes_total ? ` / ${size(model.bytes_total)}` : ' · size pending'}
          </p>
          <InstallExpectation downloadBytes={model.bytes_total} thing={model.repository} />
        </div>
      ) : null}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">Download receipt</summary>
        <dl className="mt-2 grid gap-2 rounded bg-muted p-3 sm:grid-cols-[auto_1fr]">
          <dt>Revision</dt>
          <dd className="break-all font-mono">{model.revision || 'Not resolved yet'}</dd>
          <dt>Requested</dt>
          <dd className="break-all">{model.requested_revision}</dd>
          <dt>Destination</dt>
          <dd className="break-all font-mono">{model.destination}</dd>
          <dt>Last observation</dt>
          <dd>{new Date((model.observed_at ?? model.updated_at) * 1000).toLocaleString()}</dd>
        </dl>
      </details>
    </article>
  );
}
