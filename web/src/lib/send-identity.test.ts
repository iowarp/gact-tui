import type { ComposerMessagePart } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { SendIdentities, sendFingerprint } from './send-identity';

const resourcePart = (id: string, revision = '1'): ComposerMessagePart => ({
  type: 'resource_ref',
  resource_id: id,
  resource_revision: revision,
  name: `${id}.pdf`,
});

const contextPart = (id: string, revision?: string): ComposerMessagePart => ({
  type: 'context_ref',
  ref_kind: 'artifact',
  ref_id: id,
  label: id,
  ...(revision === undefined ? {} : { revision }),
});

describe('sendFingerprint', () => {
  it('separates two reference-only sends that carry different resources', () => {
    expect(
      sendFingerprint({ delivery: 'start', references: [resourcePart('a')], text: '' }),
    ).not.toEqual(
      sendFingerprint({ delivery: 'start', references: [resourcePart('b')], text: '' }),
    );
  });

  it('separates two revisions of the same resource', () => {
    expect(
      sendFingerprint({ delivery: 'start', references: [resourcePart('a', '1')], text: '' }),
    ).not.toEqual(
      sendFingerprint({ delivery: 'start', references: [resourcePart('a', '2')], text: '' }),
    );
  });

  it('keeps an unchanged reference-only send on one fingerprint', () => {
    expect(
      sendFingerprint({ delivery: 'start', references: [resourcePart('a')], text: '' }),
    ).toEqual(sendFingerprint({ delivery: 'start', references: [resourcePart('a')], text: '' }));
  });

  it('still separates context references by kind, id and revision', () => {
    expect(
      sendFingerprint({
        delivery: 'start',
        references: [contextPart('artifact_1', 'v1')],
        text: '',
      }),
    ).not.toEqual(
      sendFingerprint({
        delivery: 'start',
        references: [contextPart('artifact_1', 'v2')],
        text: '',
      }),
    );
    expect(
      sendFingerprint({ delivery: 'start', references: [contextPart('artifact_1')], text: '' }),
    ).not.toEqual(
      sendFingerprint({ delivery: 'start', references: [contextPart('artifact_2')], text: '' }),
    );
  });

  it('separates a resource reference from a context reference of the same id', () => {
    expect(
      sendFingerprint({ delivery: 'start', references: [resourcePart('shared')], text: '' }),
    ).not.toEqual(
      sendFingerprint({ delivery: 'start', references: [contextPart('shared')], text: '' }),
    );
  });
});

describe('SendIdentities', () => {
  it('mints a new idempotency key when a rejected reference-only send swaps its file', () => {
    let minted = 0;
    const identities = new SendIdentities(() => `id-${(minted += 1)}`);

    const rejected = identities.forSend(
      sendFingerprint({ delivery: 'start', references: [resourcePart('first')], text: '' }),
    );
    // The service refused the send, so the draft is still pending: the person
    // swaps the attached file and sends again. That is a different message, not
    // a redelivery of the refused one.
    const resent = identities.forSend(
      sendFingerprint({ delivery: 'start', references: [resourcePart('second')], text: '' }),
    );

    expect(resent.idempotencyKey).not.toEqual(rejected.idempotencyKey);
    expect(resent.clientMessageId).not.toEqual(rejected.clientMessageId);
  });

  it('reuses the identity while an unchanged reference-only send is retried', () => {
    let minted = 0;
    const identities = new SendIdentities(() => `id-${(minted += 1)}`);
    const fingerprint = sendFingerprint({
      delivery: 'start',
      references: [resourcePart('first')],
      text: '',
    });

    expect(identities.forSend(fingerprint)).toEqual(identities.forSend(fingerprint));
  });
});
