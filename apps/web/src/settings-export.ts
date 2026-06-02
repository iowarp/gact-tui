/**
 * 1.0 item 7 — Settings export/import.
 *
 * Exports every `clio.*` localStorage preference EXCEPT the backend
 * registry (`clio.backends.v1` carries bearer tokens — credentials never
 * leave the machine). Values ride as raw strings so import is an exact
 * round-trip regardless of each key's internal format.
 */

export interface SettingsExportEnvelope {
  /** Envelope format version — bump on breaking changes. */
  version: 1;
  exportedAt: string;
  app: 'clio-desktop';
  prefs: Record<string, string>;
}

/** Keys that must never leave the machine (credentials). */
const EXCLUDED_KEYS = new Set(['clio.backends.v1']);

/** Snapshot every exportable `clio.*` key as raw strings. */
export function collectPrefs(): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof localStorage === 'undefined') return out;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith('clio.')) continue;
    if (EXCLUDED_KEYS.has(k)) continue;
    const v = localStorage.getItem(k);
    if (v !== null) out[k] = v;
  }
  return out;
}

export function buildEnvelope(): SettingsExportEnvelope {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: 'clio-desktop',
    prefs: collectPrefs(),
  };
}

/** Serializes the envelope and triggers a browser download. Returns the
 * filename written. */
export function downloadSettings(): string {
  const envelope = buildEnvelope();
  const stamp = envelope.exportedAt.replace(/[:.]/g, '-');
  const name = `clio-settings-${stamp}.json`;
  const blob = new Blob([JSON.stringify(envelope, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  return name;
}

export interface ImportResult {
  applied: number;
  skipped: number;
}

/**
 * Parses + validates an exported envelope and applies it to localStorage.
 * Throws (human-readable message) on malformed input. Credential keys are
 * never applied even if present in a (tampered) file; non-`clio.` keys and
 * non-string values are skipped, not errors.
 */
export function importSettings(raw: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Not a valid JSON file.');
  }
  const env = parsed as Partial<SettingsExportEnvelope>;
  if (env.version !== 1 || typeof env.prefs !== 'object' || env.prefs === null) {
    throw new Error('Not a CLIO settings export (missing version 1 envelope).');
  }
  let applied = 0;
  let skipped = 0;
  for (const [k, v] of Object.entries(env.prefs)) {
    if (!k.startsWith('clio.') || EXCLUDED_KEYS.has(k) || typeof v !== 'string') {
      skipped++;
      continue;
    }
    try {
      localStorage.setItem(k, v);
      applied++;
    } catch {
      // Quota or storage failure — count it, keep going.
      skipped++;
    }
  }
  return { applied, skipped };
}
