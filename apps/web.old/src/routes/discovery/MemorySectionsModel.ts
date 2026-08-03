/**
 * View-model / pure logic for Memory Sections: state shaping and helpers, no DOM. Key export `MemoryEventRow`.
 */
export interface MemoryEventRow {
  id?: string;
  type?: string;
  scope?: string;
  created_at?: string;
  message?: string;
  payload?: Record<string, unknown>;
  [k: string]: unknown;
}

export function memoryEventTypeTone(type?: string): string {
  return (type ?? 'event').split('.')[0] ?? 'event';
}

export function humanWhen(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const delta = now - d.getTime();
  const min = Math.round(delta / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.round(hr / 24)}d`;
}
