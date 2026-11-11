import type { InfrastructureTarget, SftpCredentials } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { vocab } from '@/lib/brand-vocabulary';
import { InfoTip } from './info-tip';
import { CircleAlertIcon } from 'lucide-react';
import { ConfigureIcon } from '@/lib/icon-vocabulary';
import { IconButton } from './primitives/icon-button';
import { RingSpinner } from './primitives/ring-spinner';
import { SourceField, SourceStatusLine } from './source-form-parts';
import { SshHostDialog } from './ssh-host-dialog';
import { sshTargetDefinition, targetMatchesHost } from './managed-service-target-utils';

/** Basic browser SFTP reuses the host editor, target records and fsspec backend. */
export function SourceSftpTarget({
  initialTargetId,
  hostLabel,
  onChange,
}: {
  initialTargetId?: string;
  hostLabel: string;
  onChange: (
    target: InfrastructureTarget | undefined,
    path?: string,
    credentials?: SftpCredentials,
  ) => void;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const scope = connectionScope(settings);
  const [selected, setSelected] = useState<InfrastructureTarget>();
  const [editing, setEditing] = useState<InfrastructureTarget>();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const attempt = useRef(0);
  useEffect(
    () => () => {
      attempt.current += 1;
    },
    [scope],
  );
  const targets = useQuery({
    queryKey: ['source-ssh-targets', scope],
    queryFn: () => repository.infrastructureTargets(),
  });
  const connect = async (target: InfrastructureTarget, credentials: SftpCredentials = {}) => {
    const current = ++attempt.current;
    setSelected(target);
    setBusy(true);
    setError(undefined);
    onChange(undefined);
    try {
      const folder = await repository.inspectSourceSsh({ target_id: target.id, credentials });
      if (current === attempt.current) onChange(target, folder.path, credentials);
    } catch (reason) {
      if (current === attempt.current)
        setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (current === attempt.current) setBusy(false);
    }
  };
  return (
    <SourceField
      label="SSH host"
      aside={
        <>
          From {hostLabel}
          <InfoTip label="About this SFTP connection">
            Uses SFTP from {hostLabel}. Choose browses the selected remote host. Basic key and
            password login are supported; interactive authentication requires {vocab.product}.
          </InfoTip>
        </>
      }
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <Select
          value={selected?.id ?? initialTargetId ?? ''}
          disabled={busy}
          onValueChange={(id) => {
            const target = targets.data?.find((row) => row.id === id);
            if (target) void connect(target);
          }}
        >
          <SelectTrigger
            aria-label="SSH connection"
            className="h-[30px] min-w-0 flex-1 rounded-[7px] text-[12.5px] data-[size=default]:h-[30px]"
          >
            <SelectValue placeholder="Choose a connection" />
          </SelectTrigger>
          <SelectContent>
            {targets.data
              ?.filter((row) => row.kind === 'ssh')
              .map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        {selected && (
          <IconButton
            label="Configure this connection"
            icon={<ConfigureIcon />}
            onClick={() => {
              setEditing(selected);
              setOpen(true);
            }}
          />
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setEditing(undefined);
            setOpen(true);
          }}
        >
          Add connection
        </Button>
      </div>
      {open && (
        <SshHostDialog
          key={editing?.id ?? 'new'}
          open
          onOpenChange={setOpen}
          onSaved={() => setOpen(false)}
          options={[]}
          step={{ index: 0, isDestination: true }}
          initial={
            editing?.ssh
              ? {
                  id: editing.id,
                  label: editing.label,
                  host: editing.ssh.host || editing.ssh.profile,
                  user: editing.ssh.user,
                  port: editing.ssh.port,
                  identityFile: editing.ssh.identity_file,
                  jumpHosts: editing.ssh.jump_hosts,
                  platform: editing.ssh.platform,
                }
              : undefined
          }
          fileConnection={{
            hostLabel,
            test: async (host, credentials) => {
              await repository.inspectSourceSsh({
                route: sshTargetDefinition(host).ssh!,
                credentials,
              });
            },
            save: async (host, credentials) => {
              const definition = sshTargetDefinition(host);
              const folder = await repository.inspectSourceSsh({
                route: definition.ssh!,
                credentials,
              });
              const known = targets.data?.find((target) => targetMatchesHost(target, host));
              const target = editing
                ? await repository.updateInfrastructureTarget(editing.id, definition)
                : (known ?? (await repository.createInfrastructureTarget(definition)));
              await targets.refetch();
              setSelected(target);
              setError(undefined);
              onChange(target, folder.path, credentials);
            },
          }}
        />
      )}
      {busy && (
        <SourceStatusLine role="status" icon={<RingSpinner />}>
          Connecting?
        </SourceStatusLine>
      )}
      {(error || targets.error) && (
        <SourceStatusLine role="alert" tone="error" icon={<CircleAlertIcon />}>
          {error || targets.error?.message}
        </SourceStatusLine>
      )}
    </SourceField>
  );
}
