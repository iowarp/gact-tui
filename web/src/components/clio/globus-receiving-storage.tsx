import type { GlobusDestination } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { useRepository } from '@/hooks/use-repository';
import { connectionScope } from '@/lib/connection-scope';
import { vocab } from '@/lib/brand-vocabulary';
import { useConnectionSettings } from '@/providers/connection-provider';
import { HostPathPicker } from './host-path-picker';
import { InfoTip } from './info-tip';
import { SourceProviderLogo } from './source-provider-logo';

/** Receiving storage belongs to the connected host and is reused by every workspace. */
export function GlobusReceivingStorage({ hostLabel }: { hostLabel: string }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const key = ['globus-receiving-storage', connectionScope(settings)];
  const client = useQueryClient();
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => repository.globusDestination(signal),
    retry: false,
  });
  const [draft, setDraft] = useState<GlobusDestination>();
  const save = useMutation({
    mutationFn: (input: GlobusDestination) => repository.saveGlobusDestination(input),
    onSuccess: (result) => {
      client.setQueryData(key, result);
      setDraft(undefined);
    },
  });
  const current = draft ??
    query.data?.destination ?? {
      collection_id: '',
      collection_root: '',
      local_root: query.data?.storage_root ?? '',
    };
  const change = (name: keyof GlobusDestination, value: string) => {
    save.reset();
    setDraft({ ...current, [name]: value });
  };
  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label="Globus receiving storage">
      <div className="flex items-center gap-3">
        <SourceProviderLogo provider="globus" />
        <div className="min-w-0 flex-1">
          <h3 className="font-medium">Globus receiving storage</h3>
          <p className="text-xs text-muted-foreground">{hostLabel}</p>
        </div>
        <InfoTip label="About Globus receiving storage">
          {vocab.agent} detects Globus Connect Personal on this host. Institutional collections can
          be connected once here. Every workspace reuses this receiving collection; transfers are
          checked before files become available in the workspace.
        </InfoTip>
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        {query.isPending
          ? 'Checking this host…'
          : query.data?.origin === 'detected'
            ? 'Globus Connect Personal detected'
            : query.data?.origin === 'configured'
              ? 'Receiving collection saved'
              : 'No receiving collection found on this host'}
      </p>
      <details>
        <summary className="cursor-pointer text-sm">Connect an existing collection</summary>
        <form
          className="mt-3 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(current);
          }}
        >
          <Field>
            <FieldLabel htmlFor="receiving-collection">Collection ID</FieldLabel>
            <Input
              id="receiving-collection"
              value={current.collection_id}
              required
              onChange={(e) => change('collection_id', e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="receiving-collection-root">Collection folder</FieldLabel>
            <Input
              id="receiving-collection-root"
              value={current.collection_root}
              required
              onChange={(e) => change('collection_root', e.target.value)}
            />
          </Field>
          <Field>
            <div className="flex items-center gap-2">
              <FieldLabel htmlFor="receiving-local-root">Same folder on {hostLabel}</FieldLabel>
              <InfoTip label="About the receiving folder">
                This maps the collection folder to the same directory on this host. It must contain
                the source storage folder shown below. Sign-in stays in each source's trusted setup.
              </InfoTip>
            </div>
            <div className="flex gap-2">
              <Input
                id="receiving-local-root"
                value={current.local_root}
                required
                onChange={(e) => change('local_root', e.target.value)}
              />
              <HostPathPicker
                targetId="local"
                hostLabel={hostLabel}
                label="Receiving folder"
                path={current.local_root}
                onChoose={(path) => change('local_root', path)}
              />
            </div>
          </Field>
          <p className="break-all text-xs text-muted-foreground">
            Source storage: {query.data?.storage_root}
          </p>
          <Button type="submit" disabled={save.isPending || query.isPending}>
            {save.isPending ? 'Saving…' : 'Save receiving storage'}
          </Button>
        </form>
      </details>
      {(query.error || save.error) && (
        <p role="alert" className="text-sm text-destructive">
          {(query.error || save.error)?.message}
        </p>
      )}
    </section>
  );
}
