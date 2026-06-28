import { describe, expect, it } from 'vitest';
import {
  sessionDefaultOptions,
  sessionDefaultsCatalogFromSettled,
  sessionDefaultsCatalogScope,
} from '../../src/routes/SettingsSessionDefaultsModel.js';

describe('SettingsSessionDefaultsModel', () => {
  it('builds the backend catalog scope from optional settings context', () => {
    expect(sessionDefaultsCatalogScope()).toEqual({});
    expect(sessionDefaultsCatalogScope({ workspaceId: 'ws_earthscope' })).toEqual({
      workspace_id: 'ws_earthscope',
    });
    expect(
      sessionDefaultsCatalogScope({
        workspaceId: 'ws_earthscope',
        sessionId: 'sess_san_diego',
      }),
    ).toEqual({
      session_id: 'sess_san_diego',
      workspace_id: 'ws_earthscope',
    });
  });

  it('maps catalog items to stable select options', () => {
    expect(
      sessionDefaultOptions([
        {
          id: 'earthscope-gnss-region',
          name: 'EarthScope GNSS',
          description: 'Pulls station time series.',
        },
        { id: 'fallback-blueprint' },
      ]),
    ).toEqual([
      {
        id: 'earthscope-gnss-region',
        label: 'EarthScope GNSS',
        description: 'Pulls station time series.',
      },
      { id: 'fallback-blueprint', label: 'fallback-blueprint' },
    ]);
  });

  it('keeps fulfilled blueprint and expert-pack results while tolerating failures', () => {
    expect(
      sessionDefaultsCatalogFromSettled(
        {
          status: 'fulfilled',
          value: {
            blueprints: [{ id: 'earthscope-gnss-region', name: 'EarthScope GNSS' }],
          },
        },
        { status: 'rejected', reason: new Error('offline') },
      ),
    ).toEqual({
      blueprints: [{ id: 'earthscope-gnss-region', label: 'EarthScope GNSS' }],
      expertPacks: [],
    });
  });
});
