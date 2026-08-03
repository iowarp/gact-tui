/** Cheap structural check. The backend remains authoritative. */
export function looksLikeCron(value: string): boolean {
  const fields = value.trim().split(/\s+/);
  return fields.length === 5 || fields.length === 6;
}

/** Humanise an ISO timestamp into a short "in N min" or "5h ago" line. */
export function humanRelativeIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const delta = d.getTime() - Date.now();
  const sign = delta >= 0 ? '' : 'ago ';
  const abs = Math.abs(delta);
  const min = Math.round(abs / 60_000);
  if (min < 1) return delta >= 0 ? 'imminently' : 'just now';
  if (min < 60) return `${sign}in ${min}m`.replace('ago in', 'ago').trim();
  const hr = Math.round(min / 60);
  if (hr < 24) return delta >= 0 ? `in ${hr}h` : `${hr}h ago`;
  const day = Math.round(hr / 24);
  return delta >= 0 ? `in ${day}d` : `${day}d ago`;
}

/** Best-effort cron to English for common forms. Falls back to the raw string. */
export function humanizeCron(raw: string): string {
  const cron = raw.trim();
  if (!cron) return '';
  const parts = cron.split(/\s+/);
  if (parts.length < 5) return cron;
  const [m, h, dom, mon, dow] = parts;
  if (m === '*' && h === '*' && dom === '*' && mon === '*' && dow === '*') {
    return 'Every minute';
  }
  if (h === '*' && dom === '*' && mon === '*' && dow === '*' && /^\d+$/.test(m ?? '')) {
    return `Every hour at :${(m ?? '0').padStart(2, '0')}`;
  }
  const stepM = (m ?? '').match(/^\*\/(\d+)$/);
  if (stepM && h === '*' && dom === '*' && mon === '*' && dow === '*') {
    return `Every ${stepM[1]} minutes`;
  }
  const stepH = (h ?? '').match(/^\*\/(\d+)$/);
  if (stepH && m === '0' && dom === '*' && mon === '*' && dow === '*') {
    return `Every ${stepH[1]} hours`;
  }
  if (/^\d+$/.test(m ?? '') && /^\d+$/.test(h ?? '') && dom === '*' && mon === '*' && dow === '*') {
    return `Daily at ${(h ?? '0').padStart(2, '0')}:${(m ?? '0').padStart(2, '0')}`;
  }
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (
    /^\d+$/.test(m ?? '') &&
    /^\d+$/.test(h ?? '') &&
    dom === '*' &&
    mon === '*' &&
    /^[0-6]$/.test(dow ?? '')
  ) {
    return `Weekly on ${dayNames[parseInt(dow ?? '0', 10)]} at ${(h ?? '0').padStart(2, '0')}:${(m ?? '0').padStart(2, '0')}`;
  }
  return cron;
}
