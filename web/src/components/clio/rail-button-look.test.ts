import type { AsyncProcess, PendingInteraction, SubagentRun } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { railButtonLook } from './rail-button-look';

const process = (live_state: string) => ({ live_state }) as AsyncProcess;
const agent = (state: string) => ({ state }) as SubagentRun;
const question = (status: string, audience?: string) =>
  ({ status, audience }) as PendingInteraction;

describe('railButtonLook', () => {
  it('lets a request waiting for the person win over running and failed work', () => {
    expect(
      railButtonLook({
        processes: [process('running'), process('failed'), process('waiting_user')],
        subagents: [],
        interactions: [question('pending'), question('answered'), question('pending', 'agent')],
      }),
    ).toEqual({ kind: 'waiting', count: 2, label: '2 waiting for you' });
  });

  it('shows failures until the rail has been opened on them', () => {
    const processes = [process('failed'), process('running')];
    expect(railButtonLook({ processes, subagents: [] })).toMatchObject({
      kind: 'failed',
      count: 1,
    });
    expect(railButtonLook({ processes, subagents: [], seenFailed: 1 })).toMatchObject({
      kind: 'running',
      count: 1,
    });
  });

  it('counts child agents when no processes are known, else reports nothing running', () => {
    expect(
      railButtonLook({ processes: [], subagents: [agent('running'), agent('queued')] }),
    ).toEqual({ kind: 'running', count: 2, label: '2 running' });
    expect(railButtonLook({ processes: [], subagents: [agent('completed')] })).toEqual({
      kind: 'idle',
      count: 0,
      label: 'Nothing running',
    });
  });
});
