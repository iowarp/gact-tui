import { beforeEach, describe, expect, it } from 'vitest';
import {
  SESSION_DEFAULT_BLUEPRINT_KEY,
  SESSION_DEFAULT_EXPERT_PACK_KEY,
  loadSessionSemanticsDefaults,
  sanitizeSessionSemantics,
  saveSessionSemanticsDefaults,
} from '../../src/session-semantics.js';

beforeEach(() => {
  localStorage.clear();
});

describe('session semantics defaults', () => {
  it('persists and clears blueprint/expert-pack defaults', () => {
    saveSessionSemanticsDefaults({
      blueprintId: 'earthscope-gnss-region',
      expertPackId: 'ndp-tools',
    });

    expect(loadSessionSemanticsDefaults()).toEqual({
      blueprintId: 'earthscope-gnss-region',
      expertPackId: 'ndp-tools',
    });

    saveSessionSemanticsDefaults({ blueprintId: '', expertPackId: '' });
    expect(localStorage.getItem(SESSION_DEFAULT_BLUEPRINT_KEY)).toBeNull();
    expect(localStorage.getItem(SESSION_DEFAULT_EXPERT_PACK_KEY)).toBeNull();
    expect(loadSessionSemanticsDefaults()).toEqual({
      blueprintId: '',
      expertPackId: '',
    });
  });

  it('drops stale saved ids that are not in the current catalog', () => {
    const sanitized = sanitizeSessionSemantics(
      { blueprintId: 'missing-blueprint', expertPackId: 'ndp-tools' },
      [{ id: 'earthscope-gnss-region', label: 'EarthScope GNSS' }],
      [{ id: 'ndp-tools', label: 'NDP Tools' }],
    );

    expect(sanitized).toEqual({
      blueprintId: '',
      expertPackId: 'ndp-tools',
    });
  });
});
