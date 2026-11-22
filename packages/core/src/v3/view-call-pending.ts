import { z } from 'zod';
import type { ClioTransport, TransportRequest } from './transport.js';

/**
 * A view's slow call (mount, reopen, its own tools/call or resource read) asks CLIO
 * to answer `202` with a status location instead of holding the request: a browser
 * opens at most six connections per origin, and a few views each holding one for
 * minutes left the page's own reads queued behind them (take 1t).
 */
export const VIEW_CALL_PREFER = 'respond-async, wait=2';
const MIN_POLL_MS = 200;
const MAX_POLL_MS = 5_000;

const pendingSchema = z.object({
  view_call_pending: z.object({
    id: z.string(),
    location: z.string(),
    route: z.string().optional(),
    retry_after_ms: z.number().optional(),
  }),
});

type ViewCallPending = z.infer<typeof pendingSchema>['view_call_pending'];

function pendingOf(value: unknown): ViewCallPending | null {
  const parsed = pendingSchema.safeParse(value);
  return parsed.success ? parsed.data.view_call_pending : null;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Send a view call with `Prefer: respond-async`, then follow its status location until
 * the real answer, which is decoded as the request asked. An abort stops the polling and
 * cancels the call on the server (best effort); a CLIO without the preference answers
 * inline, as before.
 */
export async function requestViewCall<T>(
  transport: ClioTransport,
  request: TransportRequest<T>,
): Promise<T> {
  const { decode, signal } = request;
  const first = await transport.request<unknown>({
    ...request,
    headers: { ...request.headers, Prefer: VIEW_CALL_PREFER },
    decode: (value) => value,
  });
  let pending = pendingOf(first);
  if (pending === null) return decode(first);
  try {
    for (;;) {
      const delay = Math.min(Math.max(pending.retry_after_ms ?? 1_000, MIN_POLL_MS), MAX_POLL_MS);
      await sleep(delay, signal);
      const next = await transport.request<unknown>({
        method: 'GET',
        path: pending.location,
        decode: (value) => value,
        signal,
      });
      const still = pendingOf(next);
      if (still === null) return decode(next);
      pending = still;
    }
  } catch (error) {
    if (signal?.aborted) {
      void transport
        .request({ method: 'DELETE', path: pending.location, decode: (value) => value })
        .catch(() => undefined);
    }
    throw error;
  }
}
