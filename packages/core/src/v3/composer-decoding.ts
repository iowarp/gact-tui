import type { z } from 'zod';

/**
 * Row-level containment for the composer's list reads.
 *
 * A queue, a steer list, a resource inventory and a delivery ledger are all
 * served as flat arrays. Decoding one with `schema.array().parse` is
 * all-or-nothing: a single row the service serialised in a shape this client
 * cannot read takes down the whole list, so the surface shows nothing rather
 * than everything-but-one. Containment inverts that — the readable rows are
 * returned and each refused row is recorded as a typed degradation.
 *
 * The record is deliberately not a silent drop. Every refusal is published to
 * the registered listeners and retained in a bounded ring, so a degradation is
 * queryable after the fact instead of vanishing between a render and a bug
 * report.
 */

/** Bounded history of refused rows. Unit: records. */
const MAX_RETAINED_DEGRADATIONS = 100;

/** The composer list a refused row belonged to. */
export type ComposerRowCollection =
  | 'pending_steers'
  | 'queued_messages'
  | 'resources'
  | 'resource_deliveries'
  | 'workspace_references';

export interface ComposerRowDegradation {
  /** Which list the row was read from. */
  collection: ComposerRowCollection;
  /** Stable machine-readable reason, safe to branch on in a surface. */
  code: 'row_decode_failed';
  /** Position of the row in the list the service served. */
  index: number;
  /** The row's own `id`/`message_id` when one was readable, for correlation. */
  id?: string;
  /** The validator's own account of what it refused. */
  reason: string;
}

type ComposerRowListener = (degradation: ComposerRowDegradation) => void;

const listeners = new Set<ComposerRowListener>();
let retained: ComposerRowDegradation[] = [];

/**
 * Subscribes to row refusals. Returns the unsubscribe, so a surface that
 * renders these can tear its subscription down with its own lifetime.
 */
export function onComposerRowDegraded(listener: ComposerRowListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The refusals recorded so far, oldest first. */
export function composerRowDegradations(): readonly ComposerRowDegradation[] {
  return retained;
}

/** Clears the retained refusals. For a test or a deliberate session reset. */
export function clearComposerRowDegradations(): void {
  retained = [];
}

function report(degradation: ComposerRowDegradation): void {
  retained = [...retained, degradation].slice(-MAX_RETAINED_DEGRADATIONS);
  for (const listener of listeners) listener(degradation);
}

function rowIdentity(row: unknown): string | undefined {
  if (typeof row !== 'object' || row === null) return undefined;
  const candidate = row as { id?: unknown; message_id?: unknown };
  if (typeof candidate.id === 'string') return candidate.id;
  if (typeof candidate.message_id === 'string') return candidate.message_id;
  return undefined;
}

/**
 * Decodes one served list row by row, keeping what is readable.
 *
 * The envelope itself is still strict: a response whose list field is missing
 * or is not an array is a decode failure of the whole read, because there is no
 * row to contain — the client asked for a list and did not get one.
 */
export function decodeComposerRows<Schema extends z.ZodTypeAny>(
  collection: ComposerRowCollection,
  schema: Schema,
  rows: unknown,
): z.infer<Schema>[] {
  if (!Array.isArray(rows)) {
    throw new TypeError(`Expected an array of ${collection} from the service`);
  }

  const decoded: z.infer<Schema>[] = [];
  rows.forEach((row, index) => {
    const parsed = schema.safeParse(row);
    if (parsed.success) {
      decoded.push(parsed.data);
      return;
    }
    report({
      collection,
      code: 'row_decode_failed',
      index,
      ...(rowIdentity(row) === undefined ? {} : { id: rowIdentity(row) }),
      reason: parsed.error.issues[0]?.message ?? 'Unable to decode the served row',
    });
  });
  return decoded;
}
