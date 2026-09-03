/**
 * Typed record of what connecting actually did on the far side.
 *
 * Connecting is not a read. Landing a person in a conversation can involve
 * creating one on the service, and auto-connect does that with no click behind
 * it — the person sees a redirect and nothing else. A write performed on
 * someone's behalf must leave a reason that can be read back, in the same shape
 * as every other degradation this client records: a stable code, the ids it
 * touched, and a bounded ring so the record survives past the render that
 * produced it.
 */

/** Bounded history of connect outcomes. Unit: records. */
const MAX_RETAINED_OUTCOMES = 50;

export interface ConnectionOutcome {
  /** Stable machine-readable reason, safe to branch on in a surface. */
  code: 'session_minted' | 'target_unresolved';
  /** The service the outcome happened on. */
  endpoint: string;
  /** The workspace involved, when one resolved. */
  workspaceId?: string;
  /** The session created or opened, when there was one. */
  sessionId?: string;
  /** Why this happened, in the client's own words. */
  reason: string;
}

type ConnectionOutcomeListener = (outcome: ConnectionOutcome) => void;

const listeners = new Set<ConnectionOutcomeListener>();
let retained: ConnectionOutcome[] = [];

/** Subscribes to connect outcomes. Returns the unsubscribe. */
export function onConnectionOutcome(listener: ConnectionOutcomeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The outcomes recorded so far, oldest first. */
export function connectionOutcomes(): readonly ConnectionOutcome[] {
  return retained;
}

/** Clears the retained outcomes. For a test or a deliberate session reset. */
export function clearConnectionOutcomes(): void {
  retained = [];
}

/** Records one connect outcome and publishes it to any listener. */
export function reportConnectionOutcome(outcome: ConnectionOutcome): void {
  retained = [...retained, outcome].slice(-MAX_RETAINED_OUTCOMES);
  for (const listener of listeners) listener(outcome);
}
