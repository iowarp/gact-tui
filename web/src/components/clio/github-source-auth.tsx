import type { ClioRepository } from '@clio/core/v3';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
import { prepareExternalUrl } from '@/tauri/external-url';
import { ProviderLoginButton } from './provider-login-button';
import { useStorageSignInPoll } from './use-storage-sign-in-poll';

type Repository = Pick<ClioRepository, 'startSourceSignIn' | 'completeSourceSignIn'>;
type Flow = Awaited<ReturnType<Repository['startSourceSignIn']>>;

/** Device authorization works from either Desktop or a browser connected to a remote host. */
export function GitHubSourceAuth({
  repository,
  appUrl,
  workspaceId,
  sourceId,
  onComplete,
}: {
  repository: Repository;
  appUrl?: string;
  workspaceId: string;
  sourceId: string;
  onComplete: () => void;
}) {
  const [flow, setFlow] = useState<Flow>();
  const poll = useStorageSignInPoll({
    flow,
    repository,
    workspaceId,
    sourceId,
    onComplete,
    onSettled: () => setFlow(undefined),
  });
  const start = useMutation({
    mutationFn: async (page: ReturnType<typeof prepareExternalUrl>) => {
      poll.clearError();
      try {
        const next = await repository.startSourceSignIn(workspaceId, sourceId);
        if (!next.user_code) throw new Error('GitHub did not return a sign-in code. Try again.');
        setFlow(next);
        await page.open(next.authorization_url);
      } catch (error) {
        page.cancel();
        setFlow(undefined);
        throw error;
      }
    },
  });

  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label="GitHub sign in">
      <h4 className="text-sm font-medium">Sign in with your GitHub account</h4>
      <p className="text-sm text-muted-foreground">
        Sign in with your own account. Public repositories do not need sign-in.
      </p>
      {appUrl && (
        <p className="text-sm text-muted-foreground">
          For private repositories or saving changes,{' '}
          <ExternalLink href={appUrl} className="underline">
            choose repositories on GitHub
          </ExternalLink>{' '}
          and return here to sign in.
        </p>
      )}
      {flow ? (
        <div className="space-y-3">
          <p className="text-sm">Enter this code on GitHub:</p>
          <output
            aria-label="GitHub sign-in code"
            className="block select-all rounded-md bg-muted p-3 text-center font-mono text-xl tracking-widest"
          >
            {flow.user_code}
          </output>
          <ExternalLink href={flow.authorization_url} className="text-sm underline">
            Open GitHub sign-in
          </ExternalLink>
          <p role="status" className="text-sm text-muted-foreground">
            Waiting for you to approve on GitHub…
          </p>
          <Button variant="ghost" onClick={() => setFlow(undefined)}>
            Cancel sign-in
          </Button>
        </div>
      ) : (
        <ProviderLoginButton
          disabled={start.isPending}
          onLogIn={() => start.mutate(prepareExternalUrl())}
          label={start.isPending ? 'Opening GitHub…' : 'Sign in with GitHub'}
        />
      )}
      {(start.error || poll.error) && (
        <p role="alert" className="text-sm text-destructive">
          {start.error?.message || poll.error}
        </p>
      )}
    </section>
  );
}
