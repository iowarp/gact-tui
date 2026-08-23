import { describe, expect, it } from 'vitest';
import { findLastSurfaceAction } from './a2ui-state';

describe('findLastSurfaceAction', () => {
  it('returns the newest persisted action acknowledgement', () => {
    expect(
      findLastSurfaceAction([
        { updateDataModel: { path: '/lastAction', value: { name: 'old', status: 'accepted' } } },
        { updateDataModel: { path: '/other', value: { name: 'ignored', status: 'accepted' } } },
        {
          updateDataModel: {
            path: '/lastAction',
            value: { name: 'form.submit', status: 'accepted' },
          },
        },
      ]),
    ).toEqual({ name: 'form.submit', status: 'accepted' });
  });

  it('ignores malformed acknowledgements', () => {
    expect(
      findLastSurfaceAction([{ updateDataModel: { path: '/lastAction', value: null } }]),
    ).toBeUndefined();
  });
});
