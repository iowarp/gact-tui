import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { ExternalLink } from '@/components/ui/external-link';
import { vocab } from '@/lib/brand-vocabulary';

/** The same managed-client/account owner serves Settings and the vault connection flow. */
export function ObsidianAccountSettings() {
  const { settings } = useConnectionSettings();
  return <ObsidianAccountForm key={connectionScope(settings)} />;
}

function ObsidianAccountForm() {
  const id = useId();
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const scope = connectionScope(settings);
  const client = useQueryClient();
  const key = ['obsidian-account', scope];
  const status = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => repository.obsidianStatus(signal),
    refetchInterval: (query) => (query.state.data?.state === 'installing' ? 1000 : 15000),
    retry: false,
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfa, setMfa] = useState('');
  const install = useMutation({
    mutationFn: () => repository.installObsidian(),
    onSuccess: (data) => client.setQueryData(key, data),
  });
  const login = useMutation({
    mutationFn: () => repository.signInObsidian({ email, password, mfa }),
    onSettled: () => {
      setPassword('');
      setMfa('');
    },
    onSuccess: (data) => {
      client.setQueryData(key, data);
      void client.invalidateQueries({ queryKey: ['obsidian-vaults', scope] });
    },
  });
  const logout = useMutation({
    mutationFn: () => repository.signOutObsidian(),
    onSuccess: (data) => {
      client.setQueryData(key, data);
      void client.invalidateQueries({ queryKey: ['obsidian-vaults', scope] });
    },
  });
  const error = status.error || install.error || login.error || logout.error;
  return (
    <section className="grid gap-4" aria-label="Obsidian Sync account">
      <p className="text-sm text-muted-foreground">
        Sync is optional. {vocab.agent} installs and manages the official client on this service. An{' '}
        <ExternalLink href="https://obsidian.md/sync" className="underline">
          Obsidian Sync subscription
        </ExternalLink>{' '}
        is required to use account sync.
      </p>
      {status.isPending ? <p role="status">Checking Obsidian Sync…</p> : null}
      {status.data &&
      (!status.data.installed ||
        status.data.state === 'installing' ||
        status.data.state === 'failed') ? (
        <div className="grid gap-2">
          <p role="status" className="text-sm">
            {status.data.message || `The Sync client is not installed in ${vocab.agent} yet.`}
          </p>
          <Button
            type="button"
            className="w-fit"
            variant="outline"
            disabled={install.isPending || status.data.state === 'installing'}
            onClick={() => install.mutate()}
          >
            {status.data.state === 'installing'
              ? 'Installing client…'
              : status.data.state === 'failed'
                ? 'Retry installation'
                : 'Install Sync client'}
          </Button>
        </div>
      ) : status.data?.authenticated ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm">Signed in to Obsidian, client {status.data.version}</p>
          <Button
            type="button"
            variant="outline"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
          >
            Sign out
          </Button>
        </div>
      ) : status.data?.installed ? (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            login.mutate();
          }}
        >
          <p className="text-xs text-muted-foreground">
            Client {status.data.version} is managed by {vocab.agent}.
          </p>
          <Field>
            <FieldLabel htmlFor={`${id}-email`}>Obsidian account email</FieldLabel>
            <Input
              id={`${id}-email`}
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={login.isPending}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-password`}>Account password</FieldLabel>
            <Input
              id={`${id}-password`}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={login.isPending}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-mfa`}>
              Two-factor code <span className="text-muted-foreground">(if enabled)</span>
            </FieldLabel>
            <Input
              id={`${id}-mfa`}
              autoComplete="one-time-code"
              value={mfa}
              onChange={(event) => setMfa(event.target.value)}
              disabled={login.isPending}
            />
          </Field>
          <Button type="submit" className="w-fit" disabled={login.isPending}>
            {login.isPending ? 'Signing in…' : 'Sign in to Obsidian'}
          </Button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      ) : null}
    </section>
  );
}
