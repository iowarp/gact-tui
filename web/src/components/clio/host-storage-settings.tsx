import type { HostStorageLocations, HostStorageSettings as Settings } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { InfoTip } from './info-tip';
import { HostPathPicker } from './host-path-picker';
import { displayHostPath } from '@/lib/host-path-display';
import { toast } from 'sonner';

const labels: Record<keyof HostStorageLocations, string> = {
  root: 'Storage root',
  models: 'Models',
  service_data: 'Service data',
  captures: 'Evidence and attention captures',
  temporary: 'Temporary files',
};

/** Persistent paths on a named host; existing deployments retain their receipts. */
export function HostStorageSettings({ targetId }: { targetId: string }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const query = useQuery({
    queryKey: ['host-storage', settings.endpoint, targetId],
    queryFn: ({ signal }) => repository.hostStorageSettings(targetId, signal),
    retry: false,
  });
  if (query.error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {query.error.message}
      </p>
    );
  if (!query.data)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading storage locations…
      </p>
    );
  return (
    <div className="space-y-4" key={`${settings.endpoint}:${targetId}`}>
      <StorageForm data={query.data} />
    </div>
  );
}

function StorageForm({ data }: { data: Settings }) {
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
      <details>
        <summary className="cursor-pointer text-sm">Override individual folders</summary>
        <div className="mt-4 space-y-4">
          {(['models', 'service_data', 'captures', 'temporary'] as const).map(field)}
        </div>
      </details>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="ml-auto flex items-center gap-2">
          <InfoTip label="Folder capacity and permissions">
            {check.data
              ? `${(check.data.free_bytes / 1024 ** 3).toFixed(1)} GiB available; ${check.data.writable ? 'writable' : 'not writable'}.`
              : 'Folder capacity is being checked.'}
          </InfoTip>
          <Button
            className="min-w-32"
            aria-busy={save.isPending || check.isFetching}
            disabled={save.isPending || !check.data?.writable || check.isFetching}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : check.isFetching ? 'Checking folder…' : 'Save locations'}
          </Button>
        </div>
      </div>
      {check.error || save.error ? (
        <p role="alert" className="text-sm text-destructive">
          {check.error?.message || save.error?.message}
        </p>
      ) : null}
    </section>
  );
}
