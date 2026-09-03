/** The identity one logical send carries, across every attempt to deliver it. */
export interface SendIdentity {
  clientMessageId: string;
  idempotencyKey: string;
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

  public constructor(private readonly newId: () => string = () => crypto.randomUUID()) {}

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
 * carrying the same attachments. Attachment URLs are stable object URLs for the
 * life of a tray entry, so editing the draft or swapping a file mints a new
 * identity.
 */
export function sendFingerprint(value: {
  delivery: string;
  files?: readonly { url: string }[];
  references?: readonly { type: string; ref_kind?: string; ref_id?: string; revision?: string }[];
  text: string;
}): string {
  return JSON.stringify([
    value.delivery,
    value.text.trim(),
    (value.references ?? []).map((reference) => [
      reference.type,
      reference.ref_kind,
      reference.ref_id,
      reference.revision,
    ]),
    (value.files ?? []).map((file) => file.url),
  ]);
}
