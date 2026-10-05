import { inTauri } from '@/lib/transport/tauri-runtime';
import { vocab } from '@/lib/brand-vocabulary';
import { SourceSftpTarget } from './source-sftp-target';
import type { InfrastructureTarget, SftpCredentials } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FieldLabel } from '@/components/ui/field';
import { useRepository } from '@/hooks/use-repository';
import { connectionScope } from '@/lib/connection-scope';
import { ConfigureIcon } from '@/lib/icon-vocabulary';
import type { SshHost } from '@/lib/ssh-hosts';
import { useConnectionSettings } from '@/providers/connection-provider';
import type { SshTransportStatus } from '@/tauri/ssh-infrastructure-transport';
import { SshAuthentication } from './managed-service-target';
import { SshHostPicker } from './ssh-host-picker';
import { SshHostsManagerDialog } from './ssh-hosts-manager-dialog';
import { connectSshTarget, registerSshTarget } from './ssh-target-connection';

/** Attach uses the complete host editor and transport also used to deploy CLIO. */
function DesktopSourceSshTarget({
  onChange,
  initialTargetId,
}: {
  onChange: (target: InfrastructureTarget | undefined, startPath?: string) => void;
  initialTargetId?: string;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const scope = connectionScope(settings);
  const [pickedHost, setHost] = useState<SshHost>();
  const [incomplete, setIncomplete] = useState(false);
  const [managing, setManaging] = useState(false);
  const [status, setStatus] = useState<SshTransportStatus>();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string>();
  const active = useRef<AbortController | undefined>(undefined);
  const [edited, setEdited] = useState(false);
  const initial = useQuery({
    queryKey: ['source-ssh-targets', scope, initialTargetId],
    queryFn: () => repository.infrastructureTargets(),
    enabled: Boolean(initialTargetId),
  });
  const target = initial.data?.find((row) => row.id === initialTargetId);
  const route = target?.ssh;
  const host: SshHost | undefined = edited
    ? pickedHost
    : target && route
      ? {
          id: route.profile ? `profile:${route.profile}` : target.id,
          label: target.label,
          profile: route.profile || undefined,
          host: route.host || undefined,
          user: route.user || undefined,
          port: route.port,
          jumpHosts: route.jump_hosts,
          identityFile: route.identity_file || undefined,
          platform: route.platform,
          installRoot: target.install_root,
        }
      : undefined;
  useEffect(() => () => active.current?.abort(), [scope]);

  const connect = async () => {
    if (!host || incomplete) return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setConnecting(true);
    setError(undefined);
    setStatus(undefined);
    onChange(undefined);
    try {
      const target = await registerSshTarget(repository, host);
      controller.signal.throwIfAborted();
      await connectSshTarget(repository, settings, target, controller.signal, setStatus);
      const storage = await repository.hostStorageSettings(target.id);
      controller.signal.throwIfAborted();
      onChange(target, storage.effective.root);
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (active.current === controller) setConnecting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <FieldLabel>SSH host</FieldLabel>
        <Button
          aria-label="Manage SSH hosts"
          disabled={connecting}
          onClick={() => setManaging(true)}
          size="icon"
          title="Manage SSH hosts"
          type="button"
          variant="ghost"
        >
          <ConfigureIcon aria-hidden="true" />
        </Button>
      </div>
      <SshHostPicker
        disabled={connecting}
        value={host}
        onChange={(next, route) => {
          setEdited(true);
          active.current?.abort();
          setHost(next);
          setIncomplete(route.emptyRows.length > 0);
          setStatus(undefined);
          setError(undefined);
          onChange(undefined);
        }}
      />
      <SshHostsManagerDialog open={managing} onOpenChange={setManaging} />
      {status?.prompt && <SshAuthentication prompt={status.prompt} sessionId={status.session_id} />}
      <Button
        type="button"
        variant="outline"
        disabled={!host || incomplete || connecting}
        onClick={() => void connect()}
      >
        {connecting ? 'Connecting…' : 'Connect host'}
      </Button>
      {(error || initial.error) && (
        <p role="alert" className="text-sm text-destructive">
          {error || initial.error?.message}
        </p>
      )}
    </div>
  );
}

/** Both clients share host definitions; only Desktop starts the interactive native transport. */
export function SourceSshTarget(props: {
  initialTargetId?: string;
  hostLabel?: string;
  onChange: (
    target: InfrastructureTarget | undefined,
    path?: string,
    credentials?: SftpCredentials,
  ) => void;
}) {
  return inTauri() ? (
    <DesktopSourceSshTarget {...props} />
  ) : (
    <SourceSftpTarget {...props} hostLabel={props.hostLabel ?? `the connected ${vocab.agent}`} />
  );
}
