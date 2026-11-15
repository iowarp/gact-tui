import { TransportError } from '@clio/core/v3';
import { t } from '@lingui/core/macro';

/** Server text that is a trace, a payload or a status line rather than a sentence. */
const TECHNICAL =
  /[{}[\]<>]|Traceback|Errno|Exception\b|Error:|KeyError|TypeError|ValueError|OSError|status \d{3}|Request failed with|https?:\/\/|\w+_\w+:/;

/**
 * Why a composer request failed, as one plain sentence. Unreachable services,
 * server faults and anything that reads like a trace or payload get fixed wording;
 * a short human sentence from the service is kept, since it is the "why".
 */
export function composerFailureReason(error: unknown, fallback: string): string {
  const refusal = storeRefusal(error);
  if (refusal) return refusal;
  if (error instanceof TransportError) {
    if (error.code === 'network_unavailable') return t`The service can't be reached.`;
    if (error.status && error.status >= 500) return t`The service hit an error.`;
  }
  const message =
    error instanceof Error ? error.message.trim() : typeof error === 'string' ? error.trim() : '';
  return humanFailureText(message) ?? fallback;
}

/** `text` when it reads as a short sentence for people; otherwise `undefined`. */
export function humanFailureText(text: string | undefined | null): string | undefined {
  const trimmed = text?.trim();
  if (!trimmed || trimmed.length > 160 || TECHNICAL.test(trimmed)) return undefined;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** Typed refusals that mean CLIO cannot record anything new (its store refuses writes). */
const STORE_REFUSALS = new Set(['clio_core_writes_refused']);

/**
 * The service's own sentence when a send was refused because CLIO's conversation
 * store refuses writes; `undefined` for any other failure. The sentence names the
 * store and what to do, so it is shown as sent rather than as "The service hit an error."
 */
export function storeRefusal(error: unknown): string | undefined {
  if (!(error instanceof TransportError) || !STORE_REFUSALS.has(error.code ?? '')) return undefined;
  return error.message.trim() || t`The conversation store is refusing writes.`;
}
