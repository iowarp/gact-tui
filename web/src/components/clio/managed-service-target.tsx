import { KeyRoundIcon, LockIcon } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { vocab } from '@/lib/brand-vocabulary';
import { writeSshTransport, type SshPrompt } from '@/tauri/ssh-infrastructure-transport';
import { t, ph } from '@lingui/core/macro';

export type ManagedTargetKind = 'local' | 'ssh';

const PROMPT_LABELS: Record<SshPrompt['kind'], string> = {
  password: t`Password`,
  passphrase: t`Key passphrase`,
  host_key: t`Trust this host key?`,
  keyboard_interactive: t`Verification`,
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
          title={t`Sent only to this OpenSSH process; ${ph({ agent: vocab.agent })} never saves it.`}
        >
          <LockIcon aria-label={t`Not saved`} className="size-3.5" />
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
            event.stopPropagation();
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
          <Button type="submit">{t`Continue`}</Button>
        </form>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </AlertDescription>
    </Alert>
  );
}
