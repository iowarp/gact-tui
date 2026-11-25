import { describe, expect, it } from 'vitest';
import type { PendingInteraction } from '@clio/core/v3';
import {
  ASK_META_KEY,
  CHOICE_META_KEY,
  declaredAskContext,
  declaredChoiceContext,
} from './declared-choices';

function interaction(payload: Record<string, unknown>): Pick<PendingInteraction, 'payload'> {
  return { payload } as Pick<PendingInteraction, 'payload'>;
}

const facts = {
  detail: 'Relay found two accounts on this site.',
  evidence: ['sacctmgr show assoc user=jaime', '/home/jaime/.relay/log/site.log'],
};

describe('relay ask facts', () => {
  it('reads the ask entry filed under the task input key', () => {
    const asked = interaction({
      input_key: 'ask-2',
      meta: { [ASK_META_KEY]: { 'ask-1': { detail: 'Another ask.' }, 'ask-2': facts } },
    });

    expect(declaredAskContext(asked)).toEqual(facts);
  });

  it("uses a map's only entry, and nothing when several belong to other asks", () => {
    expect(declaredAskContext(interaction({ meta: { [ASK_META_KEY]: { a: facts } } }))).toEqual(
      facts,
    );
    const others = interaction({
      meta: { [ASK_META_KEY]: { a: facts, b: { detail: 'Another ask.' } } },
    });
    expect(declaredAskContext(others)).toEqual({ detail: undefined, evidence: [] });
  });

  it("stands in for a choice's facts only when the choice says nothing more", () => {
    const choice = {
      field: 'account',
      options: [{ value: 'a' }, { value: 'b' }],
      note: 'Pick one.',
    };
    const asked = interaction({
      metadata: {
        elicitation: {
          input_key: 'ask-1',
          meta: {
            [CHOICE_META_KEY]: { 'ask-1': { account: choice } },
            [ASK_META_KEY]: { 'ask-1': facts },
          },
        },
      },
    });
    expect(declaredChoiceContext(asked, 'account')).toEqual({ note: 'Pick one.', ...facts });

    const own = interaction({
      metadata: {
        elicitation: {
          input_key: 'ask-1',
          meta: {
            [CHOICE_META_KEY]: { 'ask-1': { account: { ...choice, detail: 'Its own.' } } },
            [ASK_META_KEY]: { 'ask-1': facts },
          },
        },
      },
    });
    expect(declaredChoiceContext(own, 'account')).toEqual({
      note: 'Pick one.',
      detail: 'Its own.',
      evidence: [],
    });
  });
});
