import { useMutation } from '@tanstack/react-query';
import { LaptopIcon, ServerIcon } from 'lucide-react';
import { ConfigureIcon } from '@/lib/icon-vocabulary';
import { useState } from 'react';
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
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
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
import { DeployFailure, DeployStageList } from './deploy-progress';
import { SshAuthentication } from './managed-service-target';
import { SshHostPicker } from './ssh-host-picker';
import { SshHostsManagerDialog } from './ssh-hosts-manager-dialog';
import { routeIncompleteMessage, type SshRouteCompleteness } from './ssh-route-utils';
import { deployNameError, LOCAL_NAME, type KnownServiceName } from './deploy-name';
import { useRemoteDeployment } from './use-remote-deployment';

type DeployTarget = 'local' | 'ssh';

export function DeployClioDialog({
  knownServices = [],
  onReady,
  open: controlledOpen,
  onOpenChange,
}: {
  /** Services already in the connect list; the new name must differ from theirs. */
  knownServices?: readonly KnownServiceName[];
  onReady: (settings: ConnectionSettings) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [target, setTarget] = useState<DeployTarget>('local');
  const [host, setHost] = useState<SshHost>();
  const [route, setRoute] = useState<SshRouteCompleteness>({ emptyRows: [0] });
  const [routeError, setRouteError] = useState<string>();
  const [managingHosts, setManagingHosts] = useState(false);
  // The name follows the chosen computer until the user types their own.
  const [customName, setCustomName] = useState<string>();
  const [nameError, setNameError] = useState<string>();
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const ready = (settings: ConnectionSettings) => {
    setOpen(false);
    onReady(settings);
  };
  const remote = useRemoteDeployment(ready);
  const managedLabel = knownServices.find((service) => service.source === 'managed')?.label;
  const defaultName = target === 'local' ? (managedLabel ?? LOCAL_NAME) : (host?.label ?? '');
  const name = customName ?? defaultName;
  const local = useMutation({
    mutationFn: async (): Promise<ConnectionSettings> => {
      const current = await getManagedBackend();
      if (current.status.kind === 'error') {
        await retryManagedBackend();
      }
      const handle = await waitForManagedBackend({});
      return {
        endpoint: handle.url,
        token: handle.bearer_token || undefined,
        label: name.trim(),
        location: 'Local',
      };
    },
    onSuccess: ready,
  });
  const running = local.isPending || remote.phase === 'running' || remote.phase === 'cancelling';
  const failedStage = remote.progress.stages.find(
    (stage) => stage.id === remote.progress.failure?.stage,
  );
  const prompt = remote.phase === 'running' ? remote.transport?.prompt : undefined;

  const deploy = () => {
    const invalidName = deployNameError(name, knownServices, (service) =>
      target === 'local'
        ? service.source === 'managed'
        : Boolean(host && service.location === host.label),
    );
    setNameError(invalidName);
    if (target === 'local') {
      if (!invalidName) local.mutate();
      return;
    }
    const incomplete = routeIncompleteMessage(route);
    if (incomplete || !host) {
      setRouteError(incomplete ?? `Choose the computer where ${vocab.agent} should run.`);
      return;
    }
    setRouteError(undefined);
    if (invalidName) return;
    void remote.deploy(host, name.trim());
  };

  return (
    <>
      <Dialog
        onOpenChange={(next) => {
          // A running deployment is stopped with Cancel, not by dismissing.
          if (!next && running) return;
          setOpen(next);
        }}
        open={open}
      >
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
            <DialogDescription className="sr-only">
              Run {vocab.agent} on this computer or install it on a computer reached with SSH.
            </DialogDescription>
          </DialogHeader>

          <RadioGroup
            className="grid grid-cols-2 gap-3"
            disabled={running}
            onValueChange={(value) => {
              setTarget(value as DeployTarget);
              setCustomName(undefined);
              setNameError(undefined);
            }}
            value={target}
          >
            <TargetOption
              icon={LaptopIcon}
              label="This computer"
              selected={target === 'local'}
              title={`The ${vocab.agent} service bundled with this app`}
              value="local"
            />
            <TargetOption
              icon={ServerIcon}
              label="Remote host"
              selected={target === 'ssh'}
              title={`Install ${vocab.agent} over SSH and connect through a private tunnel`}
              value="ssh"
            />
          </RadioGroup>

          <Field data-invalid={Boolean(nameError) || undefined}>
            <FieldLabel htmlFor="deploy-clio-name">Name</FieldLabel>
            <Input
              aria-invalid={Boolean(nameError)}
              autoComplete="off"
              disabled={running}
              id="deploy-clio-name"
              onChange={(event) => {
                setCustomName(event.target.value);
                setNameError(undefined);
              }}
              placeholder={target === 'local' ? LOCAL_NAME : 'For example, ares lab'}
              value={name}
            />
            {nameError ? <FieldError>{nameError}</FieldError> : null}
          </Field>

          {target === 'ssh' ? (
            <Field data-invalid={Boolean(routeError) || undefined}>
              <div className="flex items-center justify-between gap-2">
                <FieldLabel>SSH host</FieldLabel>
                <Button
                  aria-label="Manage SSH hosts"
                  disabled={running}
                  onClick={() => setManagingHosts(true)}
                  size="icon"
                  title="Manage SSH hosts"
                  type="button"
                  variant="ghost"
                >
                  <ConfigureIcon aria-hidden="true" />
                </Button>
              </div>
              <SshHostPicker
                disabled={running}
                onChange={(next, completeness) => {
                  setHost(next);
                  setRoute(completeness);
                  setRouteError(undefined);
                }}
                value={host}
              />
              {routeError ? <FieldError>{routeError}</FieldError> : null}
            </Field>
          ) : null}

          {target === 'ssh' && remote.phase !== 'idle' ? (
            <DeployStageList progress={remote.progress} />
          ) : null}

          {prompt && remote.transport ? (
            <SshAuthentication prompt={prompt} sessionId={remote.transport.session_id} />
          ) : null}

          {target === 'ssh' && remote.phase === 'failed' && remote.progress.failure ? (
            <DeployFailure
              details={
                [remote.progress.failure.log, remote.details].filter(Boolean).join('\n\n') ||
                undefined
              }
              reason={remote.progress.failure.reason}
              title={failedStage ? `${failedStage.label} failed` : 'Deployment failed'}
            />
          ) : null}

          {target === 'ssh' && remote.phase === 'cancelled' && remote.details ? (
            <DeployFailure
              reason="The deployment was cancelled."
              title="Cancelled"
              details={remote.details}
            />
          ) : null}

          {target === 'local' && local.error ? (
            <DeployFailure
              reason={local.error instanceof Error ? local.error.message : String(local.error)}
              title={`${vocab.agent} did not start`}
            />
          ) : null}

          <DialogFooter>
            {remote.phase === 'running' || remote.phase === 'cancelling' ? (
              <Button
                disabled={remote.phase === 'cancelling'}
                onClick={() => void remote.cancel()}
                type="button"
                variant="outline"
              >
                {remote.phase === 'cancelling' ? 'Cancelling…' : 'Cancel'}
              </Button>
            ) : null}
            <Button disabled={running} onClick={deploy} type="button">
              {running
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

      <SshHostsManagerDialog onOpenChange={setManagingHosts} open={managingHosts} />
    </>
  );
}

function TargetOption({
  icon: Icon,
  label,
  selected,
  title,
  value,
}: {
  icon: typeof LaptopIcon;
  label: string;
  selected: boolean;
  title: string;
  value: DeployTarget;
}) {
  return (
    <FieldLabel
      className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors hover:border-primary/60 ${selected ? 'border-primary bg-primary/8' : ''}`}
      htmlFor={`deploy-clio-${value}`}
      title={title}
    >
      <RadioGroupItem className="sr-only" id={`deploy-clio-${value}`} value={value} />
      <span className="grid size-8 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <span className="font-medium">{label}</span>
    </FieldLabel>
  );
}
