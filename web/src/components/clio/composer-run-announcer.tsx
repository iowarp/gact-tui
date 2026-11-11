import type { RunState } from '@clio/core/v3';
import { useEffect, useRef, useState } from 'react';
import { clioStatusLabel } from './status';

const RUN_ANNOUNCEMENTS: Partial<Record<RunState, string>> = {
  running: 'Running',
  queued: 'Queued, waiting to start',
  waiting_permission: 'Permission needed',
  waiting_user: 'Waiting for your answer',
  completed: 'Finished',
  failed: 'Run failed',
  cancelled: 'Stopped',
};

const queuedCount = (count: number) => `${count} queued ${count === 1 ? 'message' : 'messages'}`;

/**
 * Says what changed, politely: the run starting, waiting, failing or ending,
 * and the queue growing or draining. Mounted with the composer so the region
 * exists before its first change; the state it opens on is not announced.
 * The page reports `queued` while a send is in flight; that is not a run state
 * of its own, so a send that fails says nothing here (its toast speaks) and a
 * send that starts a run is announced when the run does.
 */
export function ComposerRunAnnouncer({
  queued,
  sending,
  state,
}: {
  queued: number;
  sending: boolean;
  state: RunState;
}) {
  const [message, setMessage] = useState('');
  const previous = useRef({ queued, state });
  useEffect(() => {
    const before = previous.current;
    const settled = sending && state === 'queued' ? before.state : state;
    previous.current = { queued, state: settled };
    const parts: string[] = [];
    if (settled !== before.state)
      parts.push(RUN_ANNOUNCEMENTS[settled] ?? clioStatusLabel(settled));
    if (queued > before.queued) parts.push(`Message queued. ${queuedCount(queued)}`);
    else if (queued < before.queued) parts.push(queued ? queuedCount(queued) : 'Queue is empty');
    if (parts.length) setMessage(parts.join('. '));
  }, [queued, sending, state]);
  return (
    <p aria-atomic="true" aria-live="polite" className="sr-only" data-slot="composer-run-status">
      {message}
    </p>
  );
}
