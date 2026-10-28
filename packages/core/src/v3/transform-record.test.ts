import { describe, expect, it } from 'vitest';

import { parseCallReference, studyCitedCalls } from './transform-record.js';

describe('parseCallReference', () => {
  it('reads a reference the way the service does, with or without the call: prefix', () => {
    expect(parseCallReference('call:sess_a/call_1')).toEqual({
      session: 'sess_a',
      callId: 'call_1',
    });
    expect(parseCallReference('sess_a/call_1')).toEqual({ session: 'sess_a', callId: 'call_1' });
    expect(parseCallReference('call:call_1')).toEqual({ session: '', callId: 'call_1' });
    expect(parseCallReference(' call_1 ')).toEqual({ session: '', callId: 'call_1' });
  });

  it('collects the cited call ids, never a session-qualified id', () => {
    const entries = [
      { fields: { analysis_call: 'sess_m/call_2', lineage: [{ call_id: 'call_1' }] } },
      { fields: { claims: [{ analysis_call: 'call:sess_m/call_3' }] } },
    ];
    expect(studyCitedCalls(entries).sort()).toEqual(['call_1', 'call_2', 'call_3']);
  });
});
