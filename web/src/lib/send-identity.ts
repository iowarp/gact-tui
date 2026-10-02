import type { ComposerMessagePart } from '@clio/core/v3';
import { referenceIdentity } from './composer-reference-domain';

/** The identity one logical send carries, across every attempt to deliver it. */
export interface SendIdentity {
  clientMessageId: string;
  idempotencyKey: string;
}

function newSendId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // randomUUID is restricted to secure contexts. The workspace can be served
  // over an HTTP LAN origin during local review; getRandomValues still works.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Hands out one identity per logical send.
 *
 * A retry of an unsent draft has to reuse its key: that is what lets the service
 * recognize a send whose response was lost instead of delivering it twice.
 * Minting per attempt makes the idempotency key decorative. A different draft
 * gets a new identity, and so does the next send after one is accepted.
 */
export class SendIdentities {
  private pending?: { fingerprint: string; identity: SendIdentity };

  public constructor(private readonly newId: () => string = newSendId) {}

  /** The identity for a send, reused while `fingerprint` keeps matching. */
  public forSend(fingerprint: string): SendIdentity {
    if (this.pending?.fingerprint === fingerprint) return this.pending.identity;
    const identity = { clientMessageId: this.newId(), idempotencyKey: this.newId() };
    this.pending = { fingerprint, identity };
    return identity;
  }

  /** Release the held identity once the service has accepted the send. */
  public accepted(): void {
    this.pending = undefined;
  }
}

/**
 * What makes two attempts the same send: the same text, delivered the same way,
 * carrying the same references and attachments. Attachment URLs are stable
 * object URLs for the life of a tray entry, so editing the draft or swapping a
 * file mints a new identity.
 *
 * A reference is folded through `referenceIdentity`, which reads both shapes
 * the composer produces. Reading only the `context_ref` fields collapsed every
 * `resource_ref` to the same tuple, so two reference-only sends carrying
 * different uploads shared one idempotency key and the service treated the
 * second as a replay of the first.
 */
export function sendFingerprint(value: {
  delivery: string;
  files?: readonly { url: string }[];
  references?: readonly ComposerMessagePart[];
  text: string;
}): string {
  return JSON.stringify([
    value.delivery,
    value.text.trim(),
    (value.references ?? []).map((reference) =>
      reference.type === 'text' ? `text:${reference.text}` : referenceIdentity(reference),
    ),
    (value.files ?? []).map((file) => file.url),
  ]);
}
