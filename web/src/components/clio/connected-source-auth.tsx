import type { ConnectedSourceState } from '@clio/core/v3';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRepository } from '@/hooks/use-repository';
import { openExternalUrl } from '@/tauri/external-url';
import { InfoTip } from './info-tip';

/** Authorization values stay in this trusted form and never enter the composer draft. */
export function ConnectedSourceAuth({
  workspaceId,
  source,
  onComplete,
}: {
  workspaceId: string;
  source: ConnectedSourceState;
  onComplete: () => void;
}) {
  const repository = useRepository();
  const [flow, setFlow] = useState<{ flow_id: string; authorization_url: string }>();
  const [callback, setCallback] = useState('');
  const start = useMutation({
    mutationFn: async () => {
      const next = await repository.startSourceSignIn(workspaceId, source.id);
      setFlow(next);
      await openExternalUrl(next.authorization_url);
    },
  });
  const complete = useMutation({
    mutationFn: async () => {
      if (!flow) throw new Error('Open the sign-in page first');
      try {
        await repository.completeSourceSignIn(workspaceId, source.id, flow.flow_id, callback);
      } finally {
        setCallback('');
      }
    },
    onSuccess: () => {
      setFlow(undefined);
      onComplete();
    },
  });
  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label="Source sign in">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-medium">Sign in through your browser</h4>
        <InfoTip label="About private sign in">
          An independent setup process handles authorization. Credentials and sign-in codes stay out
          of the conversation and agent tools. The agent receives only connection status and
          approved file references.
        </InfoTip>
      </div>
      <Button variant="outline" disabled={start.isPending} onClick={() => start.mutate()}>
        Open sign-in page
      </Button>
      {flow && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            complete.mutate();
          }}
        >
          <label className="text-sm" htmlFor="source-auth-return">
            {source.provider === 'globus'
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
      {(start.error || complete.error) && (
        <p role="alert" className="text-sm text-destructive">
          {(start.error || complete.error)?.message}
        </p>
      )}
    </section>
  );
}
