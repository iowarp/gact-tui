import type { HostStorageLocations, HostStorageSettings as Settings } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ChevronRightIcon, CircleAlertIcon, FolderIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { cn } from '@/lib/utils';
import { InfoTip } from './info-tip';
import { HostPathPicker } from './host-path-picker';
import { StateView } from './primitives/state-view';
import { StatusIndicator } from './primitives/status-indicator';
import { SourceStatusLine, sourceInputClass } from './source-form-parts';
import { displayHostPath } from '@/lib/host-path-display';
import { formatBytes } from '@/lib/format';
import { toast } from 'sonner';

const labels: Record<keyof HostStorageLocations, string> = {
  root: 'Storage root',
  models: 'Models',
  service_data: 'Service data',
  captures: 'Evidence and attention captures',
  temporary: 'Temporary files',
};

/** What a frame's Save button needs from the form it closes. */
export interface HostStorageSaveState {
  submit: () => void;
  disabled: boolean;
  pending: boolean;
}

/** Persistent paths on a named host; existing deployments retain their receipts. */
export function HostStorageSettings({
  targetId,
  onSaved,
  onSaveState,
}: {
  targetId: string;
  onSaved?: () => void;
  /**
   * The form sits in a frame whose footer owns Save (Storage on <host>): the
   * form drops its own button and reports what the frame's button needs.
   */
  onSaveState?: (state: HostStorageSaveState | null) => void;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const query = useQuery({
    queryKey: ['host-storage', settings.endpoint, targetId],
    queryFn: ({ signal }) => repository.hostStorageSettings(targetId, signal),
    retry: false,
  });
  if (query.error)
    return (
      <StateView
        action={{ label: 'Retry', onClick: () => void query.refetch() }}
        detail={query.error.message}
        kind="error"
        size="row"
        title="Could not read storage locations"
      />
    );
  if (!query.data)
    return <StateView kind="loading" size="row" title="Loading storage locations…" />;
  return (
    <StorageForm
      data={query.data}
      key={`${settings.endpoint}:${targetId}`}
      onSaveState={onSaveState}
      onSaved={onSaved}
    />
  );
}

/** A path field quiet as a key-value value (`.c3kv .v`) until pointed at or focused. */
const overrideInputClass =
  'h-[25px] min-w-0 rounded-[5px] border-transparent bg-transparent px-1.5 text-right font-mono text-label text-foreground/85 shadow-none placeholder:text-faint hover:border-input md:text-label dark:bg-transparent';

function StorageForm({
  data,
  onSaved,
  onSaveState,
}: {
  data: Settings;
  onSaved?: () => void;
  onSaveState?: (state: HostStorageSaveState | null) => void;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<HostStorageLocations>(() =>
    Object.fromEntries(
      Object.entries(data.requested).map(([key, value]) => [key, displayHostPath(value ?? '')]),
    ),
  );
  const root = draft.root || displayHostPath(data.defaults.root || '');
  const separator = root.includes('\\') ? '\\' : '/';
  const inherited = {
    root: displayHostPath(data.defaults.root || ''),
    ...Object.fromEntries(
      Object.entries({
        models: 'models',
        service_data: 'services',
        captures: 'captures',
        temporary: 'tmp',
      }).map(([key, folder]) => [key, `${root.replace(/[\\/]+$/, '')}${separator}${folder}`]),
    ),
  } as HostStorageLocations;
  const save = useMutation({
    mutationFn: () => repository.saveHostStorageSettings(data.target_id, draft),
    onSuccess: (next) => {
      queryClient.setQueryData(['host-storage', settings.endpoint, data.target_id], next);
      toast.success('Locations saved for new deployments.');
      onSaved?.();
    },
  });
  const change = (name: keyof HostStorageLocations, value: string) => {
    save.reset();
    setDraft((previous) => ({ ...previous, [name]: value }));
  };
  const check = useQuery({
    queryKey: ['host-storage-capacity', settings.endpoint, data.target_id, root],
    queryFn: ({ signal }) => repository.inspectHostPath(data.target_id, { path: root }, signal),
    retry: false,
  });
  const saveDisabled = save.isPending || !check.data?.writable || check.isFetching;
  const { mutate } = save;
  useEffect(() => {
    onSaveState?.({ submit: () => mutate(), disabled: saveDisabled, pending: save.isPending });
  }, [onSaveState, mutate, saveDisabled, save.isPending]);
  useEffect(() => () => onSaveState?.(null), [onSaveState]);
  const picker = (name: keyof HostStorageLocations, triggerClassName: string) => (
    <HostPathPicker
      targetId={data.target_id}
      label={labels[name]}
      hostLabel={data.host_label}
      path={draft[name] || inherited[name] || ''}
      disabled={save.isPending}
      onChoose={(path) => change(name, path)}
      triggerClassName={triggerClassName}
    />
  );
  const failure = check.error?.message || save.error?.message;
  return (
    <section
      className="flex min-w-0 flex-col gap-[13px] text-menu"
      aria-label={`Storage on ${data.host_label}`}
    >
      <div className="flex min-w-0 flex-col gap-[5px]">
        <div className="flex items-center gap-1.5">
          <label
            htmlFor="storage-root"
            className="text-label whitespace-nowrap text-muted-foreground"
          >
            {labels.root}
          </label>
          <InfoTip label="About storage locations">
            Paths are on the selected host. New deployments inherit these locations; existing
            deployments keep their recorded paths. Docker and Podman image storage is configured
            separately in the container engine.
          </InfoTip>
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <Input
            id="storage-root"
            className={cn(sourceInputClass, 'min-w-0 flex-1 font-mono text-meta md:text-meta')}
            value={draft.root || ''}
            placeholder={inherited.root}
            disabled={save.isPending}
            onChange={(event) => change('root', event.target.value)}
          />
          {picker('root', 'h-[30px] shrink-0 px-2 text-meta text-muted-foreground')}
        </div>
      </div>
      <Collapsible className="group/override -mx-2 flex min-w-0 flex-col">
        <CollapsibleTrigger className="flex min-h-[30px] w-full cursor-pointer items-center gap-[9px] rounded-[6px] px-2 py-[3px] text-left text-menu whitespace-nowrap text-foreground outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring/50">
          <span aria-hidden="true" className="grid w-3 shrink-0 place-items-center text-faint">
            <ChevronRightIcon className="size-3 group-data-[state=open]/override:rotate-90 motion-safe:transition-transform" />
          </span>
          Override individual folders
        </CollapsibleTrigger>
        <CollapsibleContent className="grid grid-cols-[40%_minmax(0,1fr)_auto] items-center gap-x-2.5 px-2 pt-1 text-meta">
          {(['models', 'service_data', 'captures', 'temporary'] as const).map((name) => (
            <div className="contents" key={name}>
              <label
                htmlFor={`storage-${name}`}
                className="flex min-h-[25px] min-w-0 items-center gap-2 whitespace-nowrap text-muted-foreground"
                title={labels[name]}
              >
                <FolderIcon aria-hidden="true" className="size-[13px] shrink-0" />
                <span className="truncate">{labels[name]}</span>
              </label>
              <Input
                id={`storage-${name}`}
                className={overrideInputClass}
                value={draft[name] || ''}
                placeholder={inherited[name]}
                title={draft[name] || inherited[name]}
                disabled={save.isPending}
                onChange={(event) => change(name, event.target.value)}
              />
              {picker(name, 'h-[22px] shrink-0 px-1.5 text-label text-muted-foreground')}
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>
      <div className="flex min-w-0 flex-col gap-[5px]">
        <h4 className="text-label font-normal text-muted-foreground">
          Folder capacity and permissions
        </h4>
        <div className="flex min-h-[26px] min-w-0 items-center text-meta">
          {check.isFetching ? (
            <StatusIndicator label="Checking folder…" tone="running" />
          ) : check.data ? (
            <StatusIndicator
              label={`${labels.root}: ${formatBytes(check.data.free_bytes)} free, ${check.data.writable ? 'writable' : 'not writable'}`}
              tone={check.data.writable ? 'success' : 'error'}
            />
          ) : null}
        </div>
      </div>
      {failure ? (
        <SourceStatusLine icon={<CircleAlertIcon />} role="alert" tone="error">
          {failure}
        </SourceStatusLine>
      ) : null}
      {onSaveState ? null : (
        <div className="flex items-center justify-end">
          <Button
            aria-busy={save.isPending || check.isFetching}
            disabled={saveDisabled}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : 'Save locations'}
          </Button>
        </div>
      )}
    </section>
  );
}
