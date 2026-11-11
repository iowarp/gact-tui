/**
 * What the pending-response stack says about itself and about who is asking.
 *
 * Three separate honesty concerns, deliberately kept apart from the response
 * cards so a change to how a failure reads cannot disturb how an answer is
 * given:
 *   - the reads that failed, for the surface as a whole;
 *   - the negotiation that degraded but did not fail;
 *   - who is asking, when it is not the session on screen.
 */
import type { PendingInteraction } from '@clio/core/v3';
import { AlertTriangleIcon, BotIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AskError } from './ask-card';

/**
 * The surface's own read failure, and any degradation that did not fail.
 *
 * These are two different statements and must not be collapsed: a failed read
 * means responses are missing, while a failed capability negotiation means the
 * client fell back to the legacy routes and every response is still here. One
 * is destructive, the other is a note.
 */
export function PendingSurfaceNotices({
  capabilityError,
  error,
}: {
  capabilityError?: Error;
  error?: Error;
}) {
  return (
    <>
      {error ? (
        <Alert variant="destructive">
          <AlertTriangleIcon aria-hidden="true" />
          <AlertTitle>Some responses could not be read</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : null}
      {capabilityError ? (
        <Alert>
          <AlertTriangleIcon aria-hidden="true" />
          <AlertTitle>Using compatibility response routes</AlertTitle>
          <AlertDescription>
            Permissions and questions remain available, but the service capability check failed:{' '}
            {capabilityError.message}
          </AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}

/**
 * Attribution for an interaction whose owner differs from the viewed session:
 * one quiet line. A known owner gets its label; an owner this workspace has not
 * listed (or listed without a usable title) says so instead of inventing a role.
 */
export function OwnerAttribution({
  interaction,
  ownerLabel,
  show,
}: {
  interaction: PendingInteraction;
  ownerLabel?: string;
  show: boolean;
}) {
  if (!show) return null;
  return (
    <span
      className="flex h-5 min-w-0 items-center gap-1.5 text-[11.5px] text-muted-foreground"
      data-slot="pending-interaction-owner"
      title={ownerLabel ?? `Requested by session ${interaction.owner_session_id}`}
    >
      <BotIcon aria-hidden="true" className="size-3 shrink-0" />
      <span className="truncate">{ownerLabel ?? 'Session not listed yet'}</span>
    </span>
  );
}

/** The server's authoritative rejection for THIS card's last attempt, never a list-wide read failure. */
export function ResponseErrorNotice({ error }: { error?: Error }) {
  return <AskError className="ml-0" error={error} />;
}
