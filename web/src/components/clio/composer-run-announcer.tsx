import type { RunState } from '@clio/core/v3';
import { useState } from 'react';
import { clioStatusLabel } from './status';
import { plural, t } from '@lingui/core/macro';

const RUN_ANNOUNCEMENTS: Partial<Record<RunState, string>> = {
  running: t`Running`,
  queued: t`Queued, waiting to start`,
  waiting_permission: t`Permission needed`,
  waiting_user: t`Waiting for your answer`,
  completed: t`Finished`,
  failed: t`Run failed`,
  cancelled: t`Stopped`,
};

const queuedCount = (count: number) =>
  plural(count, { one: '# queued message', other: '# queued messages' });

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
  // Adjusted during render rather than in an effect, so the announcement lands
  // in the same commit as the change it describes.
  const [seen, setSeen] = useState({ message: '', queued, state });
  const settled = sending && state === 'queued' ? seen.state : state;
  if (settled !== seen.state || queued !== seen.queued) {
    const parts: string[] = [];
    if (settled !== seen.state) parts.push(RUN_ANNOUNCEMENTS[settled] ?? clioStatusLabel(settled));
    if (queued > seen.queued)
      parts.push(
        plural(queued, {
          one: 'Message queued. # queued message',
          other: 'Message queued. # queued messages',
        }),
      );
    else if (queued < seen.queued) parts.push(queued ? queuedCount(queued) : t`Queue is empty`);
    setSeen({ message: parts.length ? parts.join('. ') : seen.message, queued, state: settled });
  }
  const { message } = seen;
  return (
    <p aria-atomic="true" aria-live="polite" className="sr-only" data-slot="composer-run-status">
      {message}
    </p>
  );
}
