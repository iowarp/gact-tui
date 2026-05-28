import type { GactEvent } from '../wire/events.js';

export type SseHandler = (event: GactEvent) => void;

/**
 * Parse a single SSE block (events terminated by a blank line) into a typed
 * GactEvent envelope, or null if the block is incomplete / malformed.
 *
 * Only used in tests and any future Node-side consumer; the browser uses
 * `EventSource` directly.
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
    const data = JSON.parse(dataLines.join('\n')) as { occurred_at?: string };
    if (typeof data?.occurred_at !== 'string') return null;
    return { type: eventType, ...data } as unknown as GactEvent;
  } catch {
    return null;
  }
}
