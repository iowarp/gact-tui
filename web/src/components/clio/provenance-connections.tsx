import type { ProvenanceConnection, ProvenanceConnectionInput } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { InfoTip } from './info-tip';
import { ManagedServiceLogo } from './managed-service-identity';
import { ClioStatus } from './status';
import { HostPathPicker } from './host-path-picker';
import { connectionScope } from '@/lib/connection-scope';
import { vocab } from '@/lib/brand-vocabulary';

/** Inventory of attached monitoring endpoints, scoped to the connected CLIO. */
export function ProvenanceConnections({
  connect,
  onClose,
}: {
  connect?: ProvenanceConnectionInput;
  onClose: () => void;
}) {
  const { settings } = useConnectionSettings();
  const repository = useRepository();
  const client = useQueryClient();
  const scope = connectionScope(settings);
  const key = ['provenance-connections', scope];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => repository.provenanceConnections(signal),
    refetchInterval: 15_000,
  });
  const refresh = () => client.invalidateQueries({ queryKey: key });
  return (
    <section aria-label="Connected provenance services" className="mt-5 space-y-3">
      {query.data?.length ? (
        <h3 className="text-sm font-semibold">
          Provenance connected to {settings.label || `this ${vocab.agent}`}
        </h3>
      ) : null}
      {query.error ? (
        <p role="alert" className="text-sm text-destructive">
          {query.error.message}
        </p>
      ) : null}
      {query.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading provenance connections…
        </p>
      ) : null}
      {query.data?.map((row) => (
        <ConnectionRow key={`${scope}:${row.id}`} row={row} onChanged={refresh} />
      ))}
      {connect ? (
        <ConnectDialog
          key={`${scope}:${connect.service_id}`}
          initial={connect}
          onClose={onClose}
          onChanged={refresh}
        />
      ) : null}
    </section>
  );
}

function ConnectionRow({
  row,
  onChanged,
}: {
  row: ProvenanceConnection;
  onChanged: () => Promise<unknown>;
}) {
  const repository = useRepository();
  const restartPending = row.selected !== row.active;
  const action = useMutation({
    mutationFn: async (verb: 'verify' | 'use' | 'disconnect' | 'forget') => {
      if (verb === 'verify') await repository.verifyProvenanceConnection(row.id);
      else if (verb === 'use') await repository.useProvenanceConnection(row.id);
      else if (verb === 'disconnect') await repository.disconnectProvenanceConnection(row.id);
      else await repository.forgetProvenanceConnection(row.id);
    },
    onSettled: onChanged,
  });
  return (
    <article aria-label={`${row.label} connection`} className="rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <ManagedServiceLogo service={{ id: row.service_id }} />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{row.label}</p>
          <p className="break-all text-xs text-muted-foreground">{row.url}</p>
        </div>
        <ClioStatus
          value={row.verified && !restartPending ? 'healthy' : 'degraded'}
          label={
            row.active
              ? row.selected
                ? 'In use'
                : 'Disconnect after restart'
              : row.selected
                ? 'Restart to activate'
                : row.verified
                  ? 'Write/readback verified'
                  : 'Not verified'
          }
        />
        <InfoTip label={`About ${row.label} connection`}>
          This {vocab.agent} connects to the service; its deployment and data stay under the service
          owner's control. Verification writes a small provenance record and reads it back.
          Attention readiness needs a separate instrumented inference check.
        </InfoTip>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={action.isPending}
          onClick={() => action.mutate('verify')}
        >
          {action.isPending && action.variables === 'verify' ? 'Verifying…' : 'Verify connection'}
        </Button>
        {!row.selected ? (
          <Button
            size="sm"
            disabled={action.isPending || !row.verified}
            onClick={() => action.mutate('use')}
          >
            Use for provenance
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={action.isPending}
            onClick={() => action.mutate('disconnect')}
          >
            Disconnect on restart
          </Button>
        )}
        {!row.selected && !row.active ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={action.isPending}
            onClick={() => action.mutate('forget')}
          >
            Forget connection
          </Button>
        ) : null}
      </div>
      {restartPending ? (
        <p role="status" className="mt-2 text-sm">
          Saved. Restart the connected {vocab.agent} to apply this choice.
        </p>
      ) : null}
      {action.error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {action.error.message}
        </p>
      ) : null}
      {Object.keys(row.verification).length ? (
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer">Verification receipt</summary>
          <pre className="mt-2 whitespace-pre-wrap break-all">
            {JSON.stringify(row.verification, null, 2)}
          </pre>
        </details>
      ) : null}
    </article>
  );
}

function ConnectDialog({
  initial,
  onClose,
  onChanged,
}: {
  initial: ProvenanceConnectionInput;
  onClose: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [draft, setDraft] = useState(initial);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const connect = useMutation({
    mutationFn: () => repository.connectProvenance(draft),
    onSuccess: async () => {
      await onChanged();
      if (mounted.current) onClose();
    },
  });
  const flowcept = draft.service_id === 'flowcept';
  const label = flowcept ? 'Flowcept' : 'HPE CMF';
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect {label}</DialogTitle>
          <DialogDescription>
            Connection and paths belong to {settings.label || `the connected ${vocab.agent}`}.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            connect.mutate();
          }}
        >
          <div className="flex items-center gap-2">
            <ManagedServiceLogo service={{ id: draft.service_id }} />
            <InfoTip label={`About connecting ${label}`}>
              {flowcept
                ? `Provide its query API URL and a Flowcept settings file already on this ${vocab.agent} host. The file contains its Redis/Mongo connection settings. The external collector remains the sole persistence owner; this client does not start another collector.`
                : 'Uses the direct CMF server API to retain artifact lineage. No Flowcept or inference service is required.'}{' '}
              Verification and activation are separate actions after connecting.
            </InfoTip>
          </div>
          <div className="space-y-1">
            <Label htmlFor="provenance-label">Name</Label>
            <Input
              id="provenance-label"
              autoFocus
              required
              value={draft.label}
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="provenance-url">Service URL from this {vocab.agent}</Label>
            <Input
              id="provenance-url"
              type="url"
              required
              placeholder={flowcept ? 'http://host:8008' : 'http://host:8380'}
              value={draft.url}
              onChange={(event) => setDraft({ ...draft, url: event.target.value })}
            />
          </div>
          {flowcept ? (
            <>
              <div className="space-y-1">
                <Label htmlFor="provenance-settings">
                  Settings file on {settings.label || `this ${vocab.agent}`}
                </Label>
                <Input
                  id="provenance-settings"
                  required
                  value={draft.settings_path ?? ''}
                  onChange={(event) => setDraft({ ...draft, settings_path: event.target.value })}
                />
                <InfoTip label="About private Flowcept settings">
                  Only the path is saved here. File contents and verification diagnostics stay
                  outside the model and transcript.
                </InfoTip>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="provenance-attention"
                  checked={draft.capture_attention ?? false}
                  onCheckedChange={(checked) => setDraft({ ...draft, capture_attention: checked })}
                />
                <Label htmlFor="provenance-attention">Capture attention context</Label>
                <InfoTip label="About attention context">
                  Records full model-call payloads in the selected provenance service for token
                  alignment. Use this only with a trusted service. The inference runtime must also
                  have its attention probe enabled.
                </InfoTip>
              </div>
              {draft.capture_attention ? (
                <div className="space-y-1">
                  <Label htmlFor="provenance-captures">
                    Attention files on {settings.label || `this ${vocab.agent}`}
                  </Label>
                  <Input
                    id="provenance-captures"
                    required
                    value={draft.attention_files_dir ?? ''}
                    onChange={(event) =>
                      setDraft({ ...draft, attention_files_dir: event.target.value })
                    }
                  />
                  <HostPathPicker
                    targetId="local"
                    hostLabel={settings.label || `this ${vocab.agent}`}
                    label="Attention files"
                    path={draft.attention_files_dir || '~'}
                    onChoose={(path) => setDraft({ ...draft, attention_files_dir: path })}
                  />
                </div>
              ) : null}
            </>
          ) : null}
          {connect.error ? (
            <p role="alert" className="text-sm text-destructive">
              {connect.error.message}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={connect.isPending}>
              {connect.isPending ? 'Connecting…' : 'Connect'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
