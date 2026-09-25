import { LaptopIcon, ServerIcon } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';
import { vocab } from '@/lib/brand-vocabulary';
import type { SshHost } from '@/lib/ssh-hosts';
import { writeSshTransport, type SshTransportStatus } from '@/tauri/ssh-infrastructure-transport';
import { targetLabel } from './managed-service-target-utils';

export type ManagedTargetKind = 'local' | 'ssh';

export function SshAuthentication({
  output,
  sessionId,
  state,
}: {
  output: string;
  sessionId: string;
  state: SshTransportStatus['state'];
}) {
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string>();
  return (
    <Alert className="mt-3">
      <ServerIcon aria-hidden="true" />
      <AlertTitle>
        {state === 'reconnecting' ? 'Reconnecting SSH' : 'SSH authentication required'}
      </AlertTitle>
      <AlertDescription className="space-y-3">
        <pre className="clio-scrollbar max-h-48 overflow-auto whitespace-pre-wrap border-y bg-background/60 p-3 font-mono text-xs">
          {output || 'Waiting for OpenSSH…'}
        </pre>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            // This prompt is rendered inside the SSH host dialog's own <form>
            // (Save host). Without stopping propagation, the native `submit`
            // event bubbles to that outer form and triggers its own submit
            // handler — saving/closing the host dialog as an unintended side
            // effect of just answering an OpenSSH prompt (#1437).
            event.stopPropagation();
            const response = answer;
            setAnswer('');
            setError(undefined);
            void writeSshTransport(sessionId, `${response}\n`).catch((reason: unknown) =>
              setError(reason instanceof Error ? reason.message : String(reason)),
            );
          }}
        >
          <Input
            aria-label="SSH prompt response"
            autoComplete="off"
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Answer the prompt shown above"
            type="password"
            value={answer}
          />
          <Button type="submit">Continue</Button>
        </form>
        <p className="text-xs text-muted-foreground">
          The response is sent only to this OpenSSH process and is never saved by {vocab.agent}.
        </p>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </AlertDescription>
    </Alert>
  );
}

export function InspectionProgress({
  host,
  target,
}: {
  host?: SshHost;
  target: ManagedTargetKind;
}) {
  const remote = target === 'ssh';
  const place = targetLabel(target, host);
  return (
    <Alert className="mt-4" role="status">
      <Spinner aria-hidden="true" />
      <AlertTitle>{remote ? `Connecting to ${place}` : 'Inspecting this computer'}</AlertTitle>
      <AlertDescription>
        {remote
          ? `Checking the SSH connection, operating system, Docker, runtimes, acceleration, and existing ${vocab.agent} services.`
          : `Checking the operating system, Docker, local runtimes, acceleration, and existing ${vocab.agent} services.`}{' '}
        You can keep using {vocab.agent} while this finishes.
      </AlertDescription>
    </Alert>
  );
}

export function TargetChoice({
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
  value: ManagedTargetKind;
}) {
  return (
    <FieldLabel
      className={`group grid cursor-pointer grid-cols-[auto_1fr] gap-x-3 border p-4 transition-colors hover:border-primary/60 ${
        selected ? 'border-primary bg-primary/8' : 'border-border bg-background/60'
      }`}
      htmlFor={`managed-target-${value}`}
    >
      <RadioGroupItem className="sr-only" id={`managed-target-${value}`} value={value} />
      <span className="row-span-2 grid size-9 place-items-center rounded-full bg-muted text-muted-foreground group-hover:text-primary">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <span className="font-medium">{label}</span>
      <span className="text-xs font-normal text-muted-foreground">{description}</span>
    </FieldLabel>
  );
}
