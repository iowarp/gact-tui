import { SftpSourceLogin } from './sftp-source-login';
import { vocab } from '@/lib/brand-vocabulary';
import type { ClioRepository, ConnectedSourceState } from '@clio/core/v3';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRepository } from '@/hooks/use-repository';
import { prepareExternalUrl } from '@/tauri/external-url';
import { ExternalLink } from '@/components/ui/external-link';
import { InfoTip } from './info-tip';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { signInToStorage } from '@/tauri/storage-oauth';
import { ProviderLoginButton } from './provider-login-button';
import { GitHubSourceAuth } from './github-source-auth';
import { useStorageSignInPoll } from './use-storage-sign-in-poll';

/** Authorization values stay in this trusted form and never enter the composer draft. */
export function ConnectedSourceAuth({
  workspaceId,
  source,
  onComplete,
  collectionConsent = false,
}: {
  workspaceId: string;
  source: ConnectedSourceState;
  onComplete: () => void;
  collectionConsent?: boolean;
}) {
  const repository = useRepository();
  if (source.provider === 'sftp')
    return <SftpSourceLogin workspaceId={workspaceId} source={source} onComplete={onComplete} />;
  return (
    <BrowserStorageAuth
      repository={repository}
      workspaceId={workspaceId}
      sourceId={source.id}
      provider={source.provider}
      appUrl={source.account_url}
      onComplete={onComplete}
      collectionConsent={collectionConsent}
    />
  );
}

/** Reuse the same browser and Desktop login flow without creating a source. */
export function ConnectedAccountSignIn({
  provider,
  appUrl,
  onComplete,
}: {
  provider: string;
  appUrl?: string;
  onComplete: () => void;
}) {
  const repository = useRepository();
  return (
    <BrowserStorageAuth
      provider={provider}
      appUrl={appUrl}
      onComplete={onComplete}
      repository={{
        startSourceSignIn: (_workspace, _source, redirect) =>
          repository.startStorageAccountSignIn(provider, redirect),
        completeSourceSignIn: async (_workspace, _source, flow, callback) => ({
          ...(await repository.completeStorageAccountSignIn(provider, flow, callback)),
          source_id: '',
        }),
      }}
    />
  );
}

function BrowserStorageAuth({
  repository,
  workspaceId = '',
  sourceId = '',
  provider,
  appUrl,
  onComplete,
  collectionConsent = false,
}: {
  repository: Pick<ClioRepository, 'startSourceSignIn' | 'completeSourceSignIn'>;
  workspaceId?: string;
  sourceId?: string;
  provider: string;
  appUrl?: string;
  onComplete: () => void;
  collectionConsent?: boolean;
}) {
  const active = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => active.current?.abort(), []);
  const [flow, setFlow] = useState<Awaited<ReturnType<ClioRepository['startSourceSignIn']>>>();
  const [callback, setCallback] = useState('');
  const poll = useStorageSignInPoll({
    flow: flow?.automatic_callback ? flow : undefined,
    repository,
    workspaceId,
    sourceId,
    onComplete,
    onSettled: () => setFlow(undefined),
  });
  const start = useMutation({
    mutationFn: async (browserPage?: ReturnType<typeof prepareExternalUrl>) => {
      poll.clearError();
      setFlow(undefined);
      if (inTauri()) {
        active.current?.abort();
        const controller = new AbortController();
        active.current = controller;
        await signInToStorage(repository, workspaceId, sourceId, provider, controller.signal);
        if (!controller.signal.aborted) onComplete();
        return;
      }
      try {
        const next = await repository.startSourceSignIn(workspaceId, sourceId);
        setFlow(next);
        await browserPage?.open(next.authorization_url);
      } catch (error) {
        browserPage?.cancel();
        throw error;
      }
    },
  });
  const complete = useMutation({
    mutationFn: async () => {
      if (!flow) throw new Error('Open the sign-in page first');
      try {
        await repository.completeSourceSignIn(workspaceId, sourceId, flow.flow_id, callback);
      } finally {
        setCallback('');
      }
    },
    onSuccess: () => {
      setFlow(undefined);
      onComplete();
    },
  });
  if (provider === 'github')
    return (
      <GitHubSourceAuth
        appUrl={appUrl}
        repository={repository}
        workspaceId={workspaceId}
        sourceId={sourceId}
        onComplete={onComplete}
      />
    );
  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label="Source sign in">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-medium">
          {collectionConsent ? 'Allow access to this collection' : 'Sign in through your browser'}
        </h4>
        <InfoTip label="About private sign in">
          Your sign-in is saved on this {vocab.agent} and can be used in any of your workspaces.
          Your password and sign-in codes are never added to a conversation.
        </InfoTip>
      </div>
      <ProviderLoginButton
        disabled={start.isPending}
        onLogIn={() => start.mutate(inTauri() ? undefined : prepareExternalUrl())}
        label={
          start.isPending
            ? 'Waiting for browser sign-in…'
            : collectionConsent
              ? 'Authorize collection'
              : flow?.automatic_callback
                ? 'Start again'
                : 'Log in'
        }
      />
      {start.isPending && (
        <Button variant="ghost" onClick={() => active.current?.abort()}>
          Cancel sign-in
        </Button>
      )}
      {flow && (
        <ExternalLink className="block text-sm underline" href={flow.authorization_url}>
          Open sign-in page
        </ExternalLink>
      )}
      {flow?.automatic_callback && (
        <p role="status" className="text-sm text-muted-foreground">
          Finish signing in with Google. {vocab.agent} will connect automatically when you return.
        </p>
      )}
      {flow && !flow.automatic_callback && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            complete.mutate();
          }}
        >
          <label className="text-sm" htmlFor="source-auth-return">
            {provider === 'globus'
              ? 'Authorization code or return URL'
              : 'Return URL after authorization'}
          </label>
          <Input
            id="source-auth-return"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={callback}
            onChange={(e) => setCallback(e.target.value)}
          />
          <Button type="submit" disabled={!callback || complete.isPending}>
            {complete.isPending ? 'Completing sign in…' : 'Complete sign in'}
          </Button>
        </form>
      )}
      {(start.error || complete.error || poll.error) && (
        <p role="alert" className="text-sm text-destructive">
          {(start.error || complete.error)?.message || poll.error}
        </p>
      )}
    </section>
  );
}
