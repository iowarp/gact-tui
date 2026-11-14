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
import { t, ph } from '@lingui/core/macro';
import { sentenceGap } from '@/lib/locale-format';
import { withAddressBreaks } from '@/lib/address-breaks';

const { agent } = vocab;

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
    <section aria-label={t`Connected provenance services`} className="min-w-0 pt-3 empty:hidden">
      {query.error && !errorShownByPage ? (
        <StateView
          action={{ label: t`Retry`, onClick: () => void query.refetch() }}
          detail={query.error.message}
          kind="error"
          size="row"
          title={t`Provenance connections could not load`}
        />
      ) : null}
      {query.isPending ? (
        <StateView kind="loading" size="row" title={t`Loading provenance connections`} />
      ) : null}
      {query.data?.length ? (
        <InfraList heading={t`Provenance connections`} {...SERVICE_COLUMNS}>
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
      ? { tone: row.verified ? 'success' : 'warning', label: t`In use` }
      : { tone: 'warning', label: t`Disconnect after restart` };
  if (row.selected) return { tone: 'warning', label: t`Restart to activate` };
  if (row.verified && !restartPending) return { tone: 'success', label: t`Verified` };
  return { tone: 'idle', label: t`Not verified` };
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
                  ? t`Verifying…`
                  : t`Verify connection`,
              onSelect: () => action.mutate('verify'),
            },
            ...(!row.selected && !row.active
              ? [
                  {
                    disabled: action.isPending,
                    icon: <DeleteIcon />,
                    label: t`Forget connection`,
                    onSelect: () => action.mutate('forget'),
                  },
                ]
              : []),
          ]}
          label={t`More actions for ${ph({ label: row.label })}`}
        />
      }
      aria-label={t`${ph({ label: row.label })} connection`}
      className="cursor-pointer"
      description={
        row.service_id === 'flowcept' ? t`Workflow provenance records` : t`Provenance records`
      }
      details={
        showDetails ? (
          <>
            {restartPending ? (
              <p className="text-meta" role="status">
                {t`Saved. Restart the connected ${agent} to apply this choice.`}
              </p>
            ) : null}
            {action.error ? (
              <StateView
                detail={action.error.message}
                kind="error"
                size="row"
                title={t`This connection action did not finish`}
              />
            ) : null}
            {expanded ? (
              <>
                <KeyValueGrid
                  items={[{ label: t`Address`, icon: <LinkIcon />, value: row.url, mono: true }]}
                />
                <p className="flex items-center gap-1 text-meta text-muted-foreground">
                  {t`This ${agent} connects to the service; the owner keeps its deployment and data.`}
                  <InfoTip label={t`About ${ph({ label: row.label })} connection`}>
                    {t`This ${agent} connects to the service; its deployment and data stay under the service owner's control. Verification writes a small provenance record and reads it back. Attention readiness needs a separate instrumented inference check.`}
                    {row.service_id === 'flowcept'
                      ? ` ${t`In use, it is also where SPOTTER and the provenance views read from.`}`
                      : null}
                  </InfoTip>
                </p>
                {Object.keys(row.verification).length ? (
                  <TechnicalDetails className="text-meta" title={t`Verification receipt`}>
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
              label={t`Use for provenance`}
              onClick={() => action.mutate('use')}
              size="sm"
            />
          ) : (
            <IconButton
              disabled={action.isPending}
              icon={<UnlinkIcon />}
              label={t`Disconnect on restart`}
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
          className="max-w-full truncate text-left font-medium outline-none focus-visible:underline @max-[480px]/infra:break-words @max-[480px]/infra:whitespace-normal @max-[480px]/infra:[word-break:auto-phrase] @max-[480px]/infra:[line-break:strict]"
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((open) => !open);
          }}
          type="button"
        >
          {withAddressBreaks(row.label)}
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
  // i18n-ignore: product names
  const label = flowcept ? 'Flowcept' : 'HPE CMF';
  const hostLabel = settings.label || t`this ${agent}`;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t`Connect ${label}`}</DialogTitle>
          <DialogDescription>
            {settings.label
              ? t`Connection and paths belong to ${ph({ host: settings.label })}.`
              : t`Connection and paths belong to the connected ${agent}.`}
          </DialogDescription>
        </DialogHeader>
        {onBack ? (
          <Button size="sm" variant="ghost" className="w-fit" onClick={onBack}>
            {t`Choose another service`}
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
            <InfoTip label={t`About connecting ${label}`}>
              {flowcept
                ? t`Provide its query API URL and a Flowcept settings file already on this ${agent} host. The file contains its Redis/Mongo connection settings. The external collector remains the sole persistence owner; this client does not start another collector.`
                : t`Uses the direct CMF server API to retain artifact lineage. No Flowcept or inference service is required.`}
              {sentenceGap()}
              {t`Verification and activation are separate actions after connecting.`}
            </InfoTip>
          </div>
          <div className="space-y-1">
            <Label htmlFor="provenance-label">{t`Name`}</Label>
            <Input
              id="provenance-label"
              autoFocus
              required
              value={draft.label}
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="provenance-url">{t`Service URL from this ${agent}`}</Label>
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
                  {t`Settings file on ${ph({ host: hostLabel })}`}
                </Label>
                <Input
                  id="provenance-settings"
                  required
                  value={draft.settings_path ?? ''}
                  onChange={(event) => setDraft({ ...draft, settings_path: event.target.value })}
                />
                <InfoTip label={t`About private Flowcept settings`}>
                  {t`Only the path is saved here. File contents and verification diagnostics stay outside the model and transcript.`}
                </InfoTip>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="provenance-attention"
                  checked={draft.capture_attention ?? false}
                  onCheckedChange={(checked) => setDraft({ ...draft, capture_attention: checked })}
                />
                <Label htmlFor="provenance-attention">{t`Capture attention context`}</Label>
                <InfoTip label={t`About attention context`}>
                  {t`Records full model-call payloads in the selected provenance service for token alignment. Use this only with a trusted service. The inference runtime must also have its attention probe enabled.`}
                </InfoTip>
              </div>
              {draft.capture_attention ? (
                <div className="space-y-1">
                  <Label htmlFor="provenance-captures">
                    {t`Attention files on ${ph({ host: hostLabel })}`}
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
                    hostLabel={hostLabel}
                    label={t`Attention files`}
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
              {t`Cancel`}
            </Button>
            <Button type="submit" disabled={connect.isPending}>
              {connect.isPending ? t`Connecting…` : t`Connect`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
