import { beforeEach, describe, expect, it } from 'vitest';
import { useLiveStore } from './live-store';

describe('live store reconciliation', () => {
  beforeEach(() => useLiveStore.getState().reset());

  it('drops an obsolete stream cursor after authoritative gap recovery', () => {
    useLiveStore.setState((state) => ({
      entities: {
        ...state.entities,
        cursor: '435',
        processed_cursors: ['433', '434', '435'],
        stream: 'gapped',
      },
    }));

    useLiveStore.getState().reconcileSnapshots({
      messages: {},
      revisions: {},
    });

    const entities = useLiveStore.getState().entities;
    expect(entities.cursor).toBeUndefined();
    expect(entities.processed_cursors).toEqual([]);
    expect(entities.stream).toBe('gapped');
  });

  it('keeps ordinary REST snapshot refreshes on the active timeline', () => {
    useLiveStore.setState((state) => ({
      entities: {
        ...state.entities,
        cursor: '52',
        processed_cursors: ['51', '52'],
      },
    }));

    useLiveStore.getState().replaceSnapshots({ messages: {} });

    const entities = useLiveStore.getState().entities;
    expect(entities.cursor).toBe('52');
    expect(entities.processed_cursors).toEqual(['51', '52']);
  });
});
