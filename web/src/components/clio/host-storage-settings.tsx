import type { HostStorageLocations, HostStorageSettings as Settings } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { InfoTip } from './info-tip';
import { HostPathPicker } from './host-path-picker';
import { StateView } from './primitives/state-view';
import { StatusIndicator } from './primitives/status-indicator';
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

/** Persistent paths on a named host; existing deployments retain their receipts. */
export function HostStorageSettings({
  targetId,
  onSaved,
  onCancel,
}: {
  targetId: string;
  onSaved?: () => void;
  /** Adds a Cancel button beside Save when the form sits in a dialog. */
  onCancel?: () => void;
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
    <div className="space-y-4" key={`${settings.endpoint}:${targetId}`}>
      <StorageForm data={query.data} onCancel={onCancel} onSaved={onSaved} />
    </div>
  );
}

function StorageForm({
  data,
  onSaved,
  onCancel,
}: {
  data: Settings;
  onSaved?: () => void;
  onCancel?: () => void;
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
  const field = (name: keyof HostStorageLocations) => (
    <Field key={name}>
      <FieldLabel htmlFor={`storage-${name}`}>{labels[name]}</FieldLabel>
      <div className="flex gap-2">
        <Input
          id={`storage-${name}`}
          value={draft[name] || ''}
          placeholder={inherited[name]}
          disabled={save.isPending}
          onChange={(event) => change(name, event.target.value)}
        />
        <HostPathPicker
          targetId={data.target_id}
          label={labels[name]}
          hostLabel={data.host_label}
          path={draft[name] || inherited[name] || ''}
          disabled={save.isPending}
          onChoose={(path) => change(name, path)}
        />
      </div>
    </Field>
  );
  return (
    <section className="space-y-4" aria-label={`Storage on ${data.host_label}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">{field('root')}</div>
        <InfoTip label="About storage locations">
          Paths are on the selected host. New deployments inherit these locations; existing
          deployments keep their recorded paths. Docker and Podman image storage is configured
          separately in the container engine.
        </InfoTip>
      </div>
      <Collapsible className="group/override">
        <CollapsibleTrigger className="flex cursor-pointer items-center gap-1.5 rounded-sm text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ChevronRightIcon
            aria-hidden="true"
            className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/override:rotate-90 motion-reduce:transition-none"
          />
          Override individual folders
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 space-y-4">
          {(['models', 'service_data', 'captures', 'temporary'] as const).map(field)}
        </CollapsibleContent>
      </Collapsible>
      <div className="flex min-w-0 flex-col gap-1">
        <h4 className="text-[11.5px] font-semibold text-muted-foreground">
          Folder capacity and permissions
        </h4>
        {check.isFetching ? (
          <StatusIndicator label="Checking folder…" tone="running" />
        ) : check.data ? (
          <StatusIndicator
            label={`${labels.root}: ${formatBytes(check.data.free_bytes)} free, ${check.data.writable ? 'writable' : 'not writable'}`}
            tone={check.data.writable ? 'success' : 'error'}
          />
        ) : null}
      </div>
      {check.error || save.error ? (
        <StateView
          kind="error"
          size="row"
          title={check.error?.message || save.error?.message || ''}
        />
      ) : null}
      <div className="flex items-center justify-end gap-2">
        {onCancel ? (
          <Button disabled={save.isPending} onClick={onCancel} variant="ghost">
            Cancel
          </Button>
        ) : null}
        <Button
          className="min-w-32"
          aria-busy={save.isPending || check.isFetching}
          disabled={save.isPending || !check.data?.writable || check.isFetching}
          onClick={() => save.mutate()}
        >
          {save.isPending ? 'Saving…' : 'Save locations'}
        </Button>
      </div>
    </section>
  );
}
