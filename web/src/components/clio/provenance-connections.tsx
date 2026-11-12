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
import { useShownByPage } from './infrastructure-reachability';
import { StateView } from './primitives/state-view';
import { TechnicalDetails } from './technical-details';
import { ManagedServiceLogo } from './managed-service-identity';
import { CheckConnectionIcon, DeleteIcon } from '@/lib/icon-vocabulary';
import { ActivityIcon, LinkIcon, PlayIcon, UnlinkIcon } from 'lucide-react';
import { InfraList, InfraRow, type InfraStatus } from './infrastructure-row';
import { IconButton } from './primitives/icon-button';
import { InfraRowMenu } from './infrastructure-row-menu';
import { KeyValueGrid } from './primitives/key-value-grid';
import { SERVICE_COLUMNS } from './managed-service-groups';
import { HostPathPicker } from './host-path-picker';
import { connectionScope } from '@/lib/connection-scope';
import { vocab } from '@/lib/brand-vocabulary';

/** Inventory of attached monitoring endpoints, scoped to the connected CLIO. */
export function ProvenanceConnections({
  connect,
  onClose,
  onBack,
}: {
  connect?: ProvenanceConnectionInput;
  onBack?: () => void;
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
  const errorShownByPage = useShownByPage(query.error);
  return (
    <section aria-label="Connected provenance services" className="min-w-0 pt-3 empty:hidden">
      {query.error && !errorShownByPage ? (
        <StateView
          action={{ label: 'Retry', onClick: () => void query.refetch() }}
          detail={query.error.message}
          kind="error"
          size="row"
          title="Provenance connections could not load"
        />
      ) : null}
      {query.isPending ? (
        <StateView kind="loading" size="row" title="Loading provenance connections" />
      ) : null}
      {query.data?.length ? (
        <InfraList heading="Provenance connections" {...SERVICE_COLUMNS}>
          {query.data.map((row) => (
            <ConnectionRow key={`${scope}:${row.id}`} row={row} onChanged={refresh} />
          ))}
        </InfraList>
      ) : null}
      {connect ? (
        <ConnectDialog
          key={`${scope}:${connect.service_id}`}
          onBack={onBack}
          initial={connect}
          onClose={onClose}
          onChanged={refresh}
        />
      ) : null}
    </section>
  );
}

function connectionStatus(row: ProvenanceConnection): InfraStatus {
  const restartPending = row.selected !== row.active;
  if (row.active)
    return row.selected
      ? { tone: row.verified ? 'success' : 'warning', label: 'In use' }
      : { tone: 'warning', label: 'Disconnect after restart' };
  if (row.selected) return { tone: 'warning', label: 'Restart to activate' };
  if (row.verified && !restartPending) return { tone: 'success', label: 'Verified' };
  return { tone: 'idle', label: 'Not verified' };
}

const stopRowClick = (event: { stopPropagation: () => void }) => event.stopPropagation();

function ConnectionRow({
  row,
  onChanged,
}: {
  row: ProvenanceConnection;
  onChanged: () => Promise<unknown>;
}) {
  const repository = useRepository();
  const [expanded, setExpanded] = useState(false);
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
  const showDetails = expanded || restartPending || Boolean(action.error);
  return (
    <InfraRow
      actions={
        <InfraRowMenu
          actions={[
            {
              disabled: action.isPending,
              icon: <CheckConnectionIcon />,
              label:
                action.isPending && action.variables === 'verify'
                  ? 'Verifying…'
                  : 'Verify connection',
              onSelect: () => action.mutate('verify'),
            },
            ...(!row.selected && !row.active
              ? [
                  {
                    disabled: action.isPending,
                    icon: <DeleteIcon />,
                    label: 'Forget connection',
                    onSelect: () => action.mutate('forget'),
                  },
                ]
              : []),
          ]}
          label={`More actions for ${row.label}`}
        />
      }
      aria-label={`${row.label} connection`}
      className="cursor-pointer"
      description={
        row.service_id === 'flowcept' ? 'Workflow provenance records' : 'Provenance records'
      }
      details={
        showDetails ? (
          <>
            {restartPending ? (
              <p className="text-meta" role="status">
                Saved. Restart the connected {vocab.agent} to apply this choice.
              </p>
            ) : null}
            {action.error ? (
              <StateView
                detail={action.error.message}
                kind="error"
                size="row"
                title="This connection action did not finish"
              />
            ) : null}
            {expanded ? (
              <>
                <KeyValueGrid
                  items={[{ label: 'Address', icon: <LinkIcon />, value: row.url, mono: true }]}
                />
                <p className="flex items-center gap-1 text-meta text-muted-foreground">
                  This {vocab.agent} connects to the service; the owner keeps its deployment and
                  data.
                  <InfoTip label={`About ${row.label} connection`}>
                    This {vocab.agent} connects to the service; its deployment and data stay under
                    the service owner's control. Verification writes a small provenance record and
                    reads it back. Attention readiness needs a separate instrumented inference
                    check.
                    {row.service_id === 'flowcept'
                      ? ' In use, it is also where SPOTTER and the provenance views read from.'
                      : null}
                  </InfoTip>
                </p>
                {Object.keys(row.verification).length ? (
                  <TechnicalDetails className="text-meta" title="Verification receipt">
                    <pre className="mt-1 font-mono text-caption break-all whitespace-pre-wrap text-muted-foreground">
                      {JSON.stringify(row.verification, null, 2)}
                    </pre>
                  </TechnicalDetails>
                ) : null}
              </>
            ) : null}
          </>
        ) : undefined
      }
      icon={<ActivityIcon />}
      onClick={() => setExpanded((open) => !open)}
      primaryAction={
        <span onClick={stopRowClick}>
          {!row.selected ? (
            <IconButton
              disabled={action.isPending || !row.verified}
              icon={<PlayIcon />}
              label="Use for provenance"
              onClick={() => action.mutate('use')}
              size="sm"
            />
          ) : (
            <IconButton
              disabled={action.isPending}
              icon={<UnlinkIcon />}
              label="Disconnect on restart"
              onClick={() => action.mutate('disconnect')}
              size="sm"
            />
          )}
        </span>
      }
      status={connectionStatus(row)}
      title={
        <button
          aria-expanded={expanded}
          className="max-w-full truncate text-left font-medium outline-none focus-visible:underline"
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((open) => !open);
          }}
          type="button"
        >
          {row.label}
        </button>
      }
    />
  );
}
function ConnectDialog({
  initial,
  onClose,
  onChanged,
  onBack,
}: {
  initial: ProvenanceConnectionInput;
  onBack?: () => void;
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
        {onBack ? (
          <Button size="sm" variant="ghost" className="w-fit" onClick={onBack}>
            Choose another service
          </Button>
        ) : null}
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
