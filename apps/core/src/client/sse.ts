import type { GactEvent } from '../wire/events.js';

export type SseHandler = (event: GactEvent) => void;

/**
 * Parse a single SSE block (events terminated by a blank line) into a typed
 * GactEvent envelope, or null if the block is incomplete / malformed.
 *
 * Only used in tests and any future Node-side consumer; the browser uses
 * `EventSource` directly. Reflects SPEC §7.2 — the `data:` line carries a
 * JSON object with `{type, occurred_at, payload}` keys; we return it
 * verbatim (no spreading), so consumers read `ev.payload.<field>`.
 */
export function parseSseBlock(block: string): GactEvent | null {
  let eventType: string | undefined;
  const dataLines: string[] = [];
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line) continue;
    if (line.startsWith(':')) continue; // comment
    if (line.startsWith('event:')) {
      eventType = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim());
    }
  }
  if (!eventType || dataLines.length === 0) return null;
  try {
    const env = JSON.parse(dataLines.join('\n')) as {
      type?: string;
      occurred_at?: string;
      payload?: unknown;
    };
    // The `event:` header and `data.type` are redundant on purpose (per
    // SPEC §7.2). Prefer `data.type` when present, fall back to the
    // header. Reject if both are missing.
    const innerType = env?.type ?? eventType;
    if (typeof innerType !== 'string') return null;
    if (typeof env?.occurred_at !== 'string') return null;
    return {
      type: innerType,
      occurred_at: env.occurred_at,
      payload: env.payload ?? {},
    } as unknown as GactEvent;
  } catch {
    return null;
  }
}
