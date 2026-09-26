import { KeyRoundIcon, LaptopIcon, LockIcon } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';
import { vocab } from '@/lib/brand-vocabulary';
import type { SshHost } from '@/lib/ssh-hosts';
import { writeSshTransport, type SshPrompt } from '@/tauri/ssh-infrastructure-transport';
import { targetLabel } from './managed-service-target-utils';

export type ManagedTargetKind = 'local' | 'ssh';

const PROMPT_LABELS: Record<SshPrompt['kind'], string> = {
  password: 'Password',
  passphrase: 'Key passphrase',
  host_key: 'Trust this host key?',
  keyboard_interactive: 'Verification',
};

/**
 * Answer the one authentication question OpenSSH is waiting on. Rendered only
 * for a real prompt (see the desktop's prompt classifier), never for `ssh>`
 * or a shell prompt, so the input always has something to answer.
 */
export function SshAuthentication({ prompt, sessionId }: { prompt: SshPrompt; sessionId: string }) {
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string>();
  const secret = prompt.kind !== 'host_key';
  return (
    <Alert className="mt-3">
      <KeyRoundIcon aria-hidden="true" />
      <AlertTitle className="flex items-center gap-1.5">
        {PROMPT_LABELS[prompt.kind]}
        <span
          className="text-muted-foreground"
          title={`Sent only to this OpenSSH process; ${vocab.agent} never saves it.`}
        >
          <LockIcon aria-label="Not saved" className="size-3.5" />
        </span>
      </AlertTitle>
      <AlertDescription className="space-y-3">
        {prompt.context && prompt.context !== prompt.text ? (
          <pre className="clio-scrollbar max-h-40 overflow-auto whitespace-pre-wrap border-y bg-background/60 p-3 font-mono text-xs">
            {prompt.context}
          </pre>
        ) : null}
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const response = answer;
            setAnswer('');
            setError(undefined);
            void writeSshTransport(
              sessionId,
              `${response}
`,
            ).catch((reason: unknown) =>
              setError(reason instanceof Error ? reason.message : String(reason)),
            );
          }}
        >
          <Input
            aria-label={prompt.text}
            autoComplete="off"
            autoFocus
            onChange={(event) => setAnswer(event.target.value)}
            placeholder={prompt.text}
            type={secret ? 'password' : 'text'}
            value={answer}
          />
          <Button type="submit">Continue</Button>
        </form>
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
