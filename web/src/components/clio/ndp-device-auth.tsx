import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { ClioRepository } from '@clio/core/v3';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
import { prepareExternalUrl } from '@/tauri/external-url';
import { useStorageSignInPoll } from './use-storage-sign-in-poll';

type Repository = Pick<ClioRepository, 'startSourceSignIn' | 'completeSourceSignIn'> &
  Partial<Pick<ClioRepository, 'cancelSourceSignIn'>>;

/** NDP device-PKCE authorization works on Desktop and remote browser connections. */
export function NDPDeviceAuth({
  repository,
  workspaceId,
  sourceId,
  onComplete,
}: {
  repository: Repository;
  workspaceId: string;
  sourceId: string;
  onComplete: () => void;
}) {
  const [flow, setFlow] = useState<Awaited<ReturnType<Repository['startSourceSignIn']>>>();
  const mounted = useRef(true);
  const latestRepository = useRef(repository);
  useEffect(() => {
    latestRepository.current = repository;
  }, [repository]);
  const generation = useRef(0);
  const pending = useRef<string | undefined>(undefined);
  const cancel = () => {
    generation.current += 1;
    const id = pending.current;
    pending.current = undefined;
    setFlow(undefined);
    if (id) void repository.cancelSourceSignIn?.(workspaceId, sourceId, id).catch(() => undefined);
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      const id = pending.current;
      if (id)
        void latestRepository.current
          .cancelSourceSignIn?.(workspaceId, sourceId, id)
          .catch(() => undefined);
    };
  }, [workspaceId, sourceId]);
  const poll = useStorageSignInPoll({
    flow,
    repository,
    workspaceId,
    sourceId,
    onComplete,
    onSettled: () => {
      pending.current = undefined;
      setFlow(undefined);
    },
  });
  const start = useMutation({
    mutationFn: async (page: ReturnType<typeof prepareExternalUrl>) => {
      const own = ++generation.current;
      poll.clearError();
      try {
        const next = await repository.startSourceSignIn(workspaceId, sourceId);
        if (!mounted.current || own !== generation.current) {
          await repository.cancelSourceSignIn?.(workspaceId, sourceId, next.flow_id);
          page.cancel();
          return;
        }
        if (!next.user_code) throw new Error('NDP did not return a sign-in code. Try again.');
        pending.current = next.flow_id;
        setFlow(next);
        await page.open(next.authorization_url);
      } catch (error) {
        page.cancel();
        throw error;
      }
    },
  });
  return (
    <section aria-label="NDP sign in" className="space-y-3">
      {flow ? (
        <>
          <p className="text-sm">Confirm this code on NDP:</p>
          <output
            aria-label="NDP sign-in code"
            className="block w-fit select-all rounded-md bg-muted px-4 py-2 font-mono text-lg tracking-widest"
          >
            {flow.user_code}
          </output>
          <ExternalLink href={flow.authorization_url} className="text-sm underline">
            Open NDP sign-in
          </ExternalLink>
          <p role="status" className="text-sm text-muted-foreground">
            Waiting for you to approve on NDP…
          </p>
          <Button variant="ghost" size="sm" onClick={cancel}>
            Cancel sign-in
          </Button>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            disabled={start.isPending}
            onClick={() => start.mutate(prepareExternalUrl())}
          >
            {start.isPending ? 'Opening NDP…' : 'Sign in to NDP'}
          </Button>
          <p className="text-xs text-muted-foreground">
            Your NDP account is shared across workspaces.
          </p>
        </div>
      )}
      {start.error || poll.error ? (
        <p role="alert" className="text-sm text-destructive">
          {start.error?.message || poll.error}
        </p>
      ) : null}
    </section>
  );
}
