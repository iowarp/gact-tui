import { useMutation } from '@tanstack/react-query';
import { LaptopIcon, ServerIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { ConnectionSettings } from '@/lib/connection';
import { vocab } from '@/lib/brand-vocabulary';
import { type SshHost } from '@/lib/ssh-hosts';
import {
  getManagedBackend,
  retryManagedBackend,
  waitForManagedBackend,
} from '@/tauri/managed-backend';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import {
  attachInfrastructureSshTransport,
  sshTransportStatus,
  type SshTransportStatus,
} from '@/tauri/ssh-infrastructure-transport';
import { SshAuthentication } from './managed-service-target';
import { targetMatchesHost, waitForOperation } from './managed-service-target-utils';
import { SshHostPicker } from './ssh-host-picker';

type DeployTarget = 'local' | 'ssh';

export function DeployClioDialog({
  onReady,
  open: controlledOpen,
  onOpenChange,
}: {
  onReady: (settings: ConnectionSettings) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [target, setTarget] = useState<DeployTarget>('local');
  const [host, setHost] = useState<SshHost>();
  const [remoteInstallRoot, setRemoteInstallRoot] = useState('');
  const [transportStatus, setTransportStatus] = useState<SshTransportStatus>();
  const [transportOutput, setTransportOutput] = useState('');
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const deployment = useMutation({
    mutationFn: async (): Promise<ConnectionSettings> => {
      if (target === 'local') {
        const current = await getManagedBackend();
        if (current.status.kind === 'error') {
          await retryManagedBackend();
        }
        const handle = await waitForManagedBackend({});
        return {
          endpoint: handle.url,
          token: handle.bearer_token || undefined,
          label: 'This computer',
          location: 'Local',
        };
      }
      if (!host) throw new Error(`Choose or add the computer where ${vocab.agent} should run.`);
      const targets = await repository.infrastructureTargets();
      const definition = {
        kind: 'ssh' as const,
        label: host.label,
        install_root: remoteInstallRoot.trim() || host.installRoot,
        ssh: {
          profile: host.profile,
          host: host.host,
          user: host.user,
          port: host.port,
          jump_hosts: host.jumpHosts,
          identity_file: host.identityFile,
          platform: host.platform,
        },
      };
      const existing = targets.find((candidate) => targetMatchesHost(candidate, host));
      const registered = existing
        ? await repository.updateInfrastructureTarget(existing.id, definition)
        : await repository.createInfrastructureTarget(definition);
      let status = await attachInfrastructureSshTransport(
        settings.endpoint,
        settings.token,
        registered,
      );
      setTransportStatus(status);
      setTransportOutput(status.output);
      for (let attempt = 0; status.state !== 'connected' && attempt < 3_600; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 250));
        status = await sshTransportStatus(status.session_id);
        setTransportStatus(status);
        setTransportOutput(status.output);
      }
      if (status.state !== 'connected')
        throw new Error(`SSH connection to ${host.label} timed out.`);
      await repository.setInfrastructureTransportState(registered.id, 'connected');
      await attachInfrastructureSshTransport(settings.endpoint, settings.token, registered);
      const operation = await repository.runManagedServiceAction('clio_agent', {
        target_id: registered.id,
        action: 'install',
        variant_id: 'released',
        configuration: {},
      });
      await waitForOperation(repository, operation);
      const catalog = await repository.managedServiceCatalog(registered.id);
      const service = catalog.services.find((candidate) => candidate.id === 'clio_agent');
      if (!service?.connection_url) {
        throw new Error(`The deployed ${vocab.agent} did not publish a connection address.`);
      }
      return {
        endpoint: service.connection_url,
        label: vocab.agent,
        location: host.label,
        infrastructure: { targetId: registered.id, serviceId: 'clio_agent' },
      };
    },
    onSuccess: (settings) => {
      setOpen(false);
      onReady(settings);
    },
  });

  const transportSessionId = transportStatus?.session_id;
  useEffect(() => {
    if (!transportSessionId) return;
    let active = true;
    let stopData: (() => void) | undefined;
    let stopState: (() => void) | undefined;
    void import('@tauri-apps/api/event').then(async ({ listen }) => {
      stopData = await listen<{ session_id: string; data: string }>(
        'clio:ssh-transport-data',
        ({ payload }) => {
          if (!active || payload.session_id !== transportSessionId) return;
          setTransportOutput((current) => `${current}${payload.data}`.slice(-32_000));
        },
      );
      stopState = await listen<{ session_id: string; state: SshTransportStatus['state'] }>(
        'clio:ssh-transport-state',
        ({ payload }) => {
          if (!active || payload.session_id !== transportSessionId) return;
          setTransportStatus((current) =>
            current ? { ...current, state: payload.state } : current,
          );
        },
      );
    });
    return () => {
      active = false;
      stopData?.();
      stopState?.();
    };
  }, [transportSessionId]);

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      {controlledOpen === undefined ? (
        <DialogTrigger asChild>
          <Button type="button" variant="outline">
            <ServerIcon aria-hidden="true" /> Deploy {vocab.agent}
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Deploy {vocab.agent}</DialogTitle>
          <DialogDescription>
            Start the bundled service on this computer, or install the pinned release on a computer
            you can reach with SSH.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          className="grid gap-3 sm:grid-cols-2"
          onValueChange={(value) => setTarget(value as DeployTarget)}
          value={target}
        >
          <TargetOption
            description="Use the desktop-managed service already included with this app."
            icon={LaptopIcon}
            label="This computer"
            selected={target === 'local'}
            value="local"
          />
          <TargetOption
            description={`Install and start ${vocab.agent} through SSH, then connect through a private tunnel.`}
            icon={ServerIcon}
            label="Remote host"
            selected={target === 'ssh'}
            value="ssh"
          />
        </RadioGroup>

        {target === 'ssh' ? (
          <Field>
            <FieldLabel>SSH host</FieldLabel>
            <SshHostPicker onChange={setHost} value={host} />
            <p className="text-xs text-muted-foreground">
              If the remote {vocab.agent} should use a service on that same computer, select this
              host again in Infrastructure. Remote {vocab.agent} cannot connect back to services on
              this desktop.
            </p>
            <details className="border-t pt-3">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                Advanced installation
              </summary>
              <Field className="mt-3">
                <FieldLabel htmlFor="remote-clio-install-root">Install location</FieldLabel>
                <Input
                  id="remote-clio-install-root"
                  onChange={(event) => setRemoteInstallRoot(event.target.value)}
                  placeholder="$HOME/.local/share/clio"
                  value={remoteInstallRoot}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to use the remote user’s home directory. On shared systems, choose a
                  writable persistent path such as /mnt/common/alice/clio.
                </p>
              </Field>
            </details>
          </Field>
        ) : (
          <p className="text-sm text-muted-foreground">
            The desktop owns this service and reconnects to it automatically when {vocab.agent}{' '}
            opens.
          </p>
        )}

        {deployment.error ? (
          <Alert variant="destructive">
            <TriangleAlertIcon aria-hidden="true" />
            <AlertTitle>Deployment did not finish</AlertTitle>
            <AlertDescription>
              {deployment.error instanceof Error
                ? deployment.error.message
                : String(deployment.error)}
            </AlertDescription>
          </Alert>
        ) : null}

        {transportStatus && transportStatus.state !== 'connected' ? (
          <SshAuthentication
            output={transportOutput}
            sessionId={transportStatus.session_id}
            state={transportStatus.state}
          />
        ) : null}

        <DialogFooter>
          <Button
            disabled={deployment.isPending || (target === 'ssh' && !host)}
            onClick={() => deployment.mutate()}
            type="button"
          >
            {deployment.isPending
              ? target === 'local'
                ? `Starting ${vocab.agent}…`
                : `Deploying to ${host?.label ?? 'remote host'}…`
              : target === 'local'
                ? `Use local ${vocab.agent}`
                : 'Deploy and connect'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TargetOption({
  description,
  icon: Icon,
  label,
  selected,
  value,
}: {
  description: string;
  icon: typeof LaptopIcon;
  label: string;
  selected: boolean;
  value: DeployTarget;
}) {
  return (
    <FieldLabel
      className={`grid cursor-pointer grid-cols-[auto_1fr] gap-x-3 rounded-xl border p-4 transition-colors hover:border-primary/60 ${selected ? 'border-primary bg-primary/8' : ''}`}
      htmlFor={`deploy-clio-${value}`}
    >
      <RadioGroupItem className="sr-only" id={`deploy-clio-${value}`} value={value} />
      <span className="row-span-2 grid size-9 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <span className="font-medium">{label}</span>
      <span className="text-xs font-normal text-muted-foreground">{description}</span>
    </FieldLabel>
  );
}
