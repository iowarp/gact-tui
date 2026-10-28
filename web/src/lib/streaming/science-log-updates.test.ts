import { PROTOCOL_VERSION, scienceLogSchema, type TransportFrame } from '@clio/core/v3';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { scienceLogQueryKey } from '@/hooks/use-science-log';
import { queryKeys } from '@/lib/query-keys';
import { ScienceEntryMerger } from './science-log-updates';

const ENDPOINT = 'http://gact.test';

function entryFrame(id: string, study: string): TransportFrame {
  return {
    eventName: 'science.entry',
    data: {
      protocol_version: PROTOCOL_VERSION,
      type: 'science.entry',
      occurred_at: '2026-10-27T10:00:00Z',
      scope: { connection_id: 'conn_1', session_id: 'sess_root' },
      payload: {
        id,
        study,
        branch: 'sess_root',
        session: 'sess_root',
        type: 'observation',
        fields: {},
        links: [],
        status: 'recorded',
        created_at: '2026-10-27T10:00:00Z',
        invocation: 'call_1',
      },
    },
  } as TransportFrame;
}

describe('ScienceEntryMerger', () => {
  it("re-reads every live source of the entry's study, and no other study's", () => {
    const client = new QueryClient();
    const log = scienceLogSchema.parse({
      session_id: 'sess_root',
      in_study: true,
      study: 'e_1',
      root_session_id: 'sess_root',
      branches: [{ session_id: 'sess_root', relation: 'root' }],
    });
    client.setQueryData(scienceLogQueryKey(ENDPOINT, 'sess_root'), log);
    const own = [...queryKeys.key('study-source', ENDPOINT, 'e_1'), 'measurements', '{}'];
    const other = [...queryKeys.key('study-source', ENDPOINT, 'e_2'), 'measurements', '{}'];
    client.setQueryData(own, { rows: 1 });
    client.setQueryData(other, { rows: 1 });
    const merger = new ScienceEntryMerger(client, ENDPOINT, 'sess_root', {
      request: () => 0,
      cancel: () => undefined,
    });
    merger.push(entryFrame('e_9', 'e_1'));
    merger.stop({ flush: true });
    expect(client.getQueryState(own)?.isInvalidated).toBe(true);
    expect(client.getQueryState(other)?.isInvalidated).toBe(false);
    const merged = client.getQueryData<typeof log>(scienceLogQueryKey(ENDPOINT, 'sess_root'));
    expect(merged?.in_study && merged.entries.map((entry) => entry.id)).toEqual(['e_9']);
  });
});
