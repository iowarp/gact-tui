import { useLayoutEffect, useRef, useState } from 'react';
import { SendIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { useComposerDraft } from '@/hooks/use-composer-draft';
import { useRepository } from '@/hooks/use-repository';
import { connectionScope } from '@/lib/connection-scope';
import { FollowupSend } from '@/lib/followup-send';
import { useConnectionSettings } from '@/providers/connection-provider';
import { InfoTip } from './info-tip';

interface Props {
  sessionId: string;
  parentSessionId: string;
  workspaceId: string;
}

/** Send to the existing child without moving or changing the parent conversation. */
export function ChildConversationFollowup(props: Props) {
  const { settings } = useConnectionSettings();
  const connection = connectionScope(settings);
  const scope = JSON.stringify([
    connection,
    props.workspaceId,
    props.parentSessionId,
    props.sessionId,
  ]);
  return <FollowupForm {...props} connection={connection} key={scope} scope={scope} />;
}

function FollowupForm({
  sessionId,
  parentSessionId,
  workspaceId,
  connection,
  scope,
}: Props & {
  connection: string;
  scope: string;
}) {
  const repository = useRepository();
  const draft = useComposerDraft(sessionId, { persist: true, endpoint: connection });
  const [send] = useState(() => new FollowupSend(scope));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const busy = useRef(false);
  const lifetime = useRef<AbortController | undefined>(undefined);
  useLayoutEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);

  async function submit(): Promise<void> {
    const controller = lifetime.current;
    if (!controller || controller.signal.aborted || busy.current || !draft.value.trim()) return;
    busy.current = true;
    setPending(true);
    setError('');
    setStatus('');
    try {
      const session = await repository.session(sessionId, workspaceId, controller.signal);
      if (controller.signal.aborted) return;
      if (
        session.id !== sessionId ||
        session.workspace_id !== workspaceId ||
        session.parent_session_id !== parentSessionId ||
        session.archived
      ) {
        throw new Error('This child conversation is no longer available under this parent.');
      }
      const result = await repository.submitMessage(
        sessionId,
        send.prepare(draft.value, session),
        controller.signal,
      );
      if (controller.signal.aborted) return;
      send.accepted();
      draft.onValueChange('');
      setStatus(
        result.state === 'started'
          ? 'Follow-up sent'
          : result.state === 'pending_steer'
            ? 'Follow-up will join the running conversation'
            : 'Follow-up queued',
      );
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : 'Could not send the follow-up.');
    } finally {
      busy.current = false;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return (
    <form
      className="grid shrink-0 gap-2 border-t bg-card/50 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Textarea
        aria-label="Message this agent"
        className="min-h-16 resize-none text-sm"
        disabled={pending}
        value={draft.value}
        placeholder="Ask about a finding or give a follow-up…"
        onChange={(event) => {
          draft.onValueChange(event.target.value);
          setStatus('');
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      {error ? (
        <p className="break-words text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span role="status">{status || 'This conversation'}</span>
          <InfoTip label="About agent follow-ups">
            Sends to this existing agent using its configured model and permissions. A running agent
            receives the follow-up at its next supported boundary. Closing the panel keeps the
            draft.
          </InfoTip>
        </div>
        <Button disabled={pending || !draft.value.trim()} size="sm" type="submit">
          {pending ? <Spinner aria-hidden="true" /> : <SendIcon aria-hidden="true" />}
          {pending ? 'Sending…' : error ? 'Retry' : 'Send'}
        </Button>
      </div>
    </form>
  );
}
