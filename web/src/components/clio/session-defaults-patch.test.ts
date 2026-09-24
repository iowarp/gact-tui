import type { SessionDefaults } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { sessionDefaultsPatch } from './session-defaults-patch';

const known: SessionDefaults = {
  provider_id: 'codex',
  model_id: 'gpt-5.6-luna',
  effort: 'high',
  mode: 'edit',
  edit_mode: 'diff',
  routing_mode: 'auto',
  approval_mode: 'ask',
  blueprint_id: '',
};

describe('sessionDefaultsPatch', () => {
  it('sends only the fields the service accepts', () => {
    const withExtras = {
      ...known,
      effort_source: 'user',
      degradations: [{ reason: 'x' }],
    } as unknown as SessionDefaults;

    expect(Object.keys(sessionDefaultsPatch(withExtras)).sort()).toEqual([
      'approval_mode',
      'blueprint_id',
      'edit_mode',
      'effort',
      'mode',
      'model_id',
      'provider_id',
      'routing_mode',
    ]);
  });

  it('resets an unknown effort to the model default and never sends unknown enums', () => {
    const patch = sessionDefaultsPatch({ ...known, effort: 'unknown', mode: 'unknown' });

    expect(patch.effort).toBeNull();
    expect(patch).not.toHaveProperty('mode');
    expect(patch.approval_mode).toBe('ask');
  });

  it('sends an unset effort as null (model default)', () => {
    expect(sessionDefaultsPatch({ ...known, effort: undefined }).effort).toBeNull();
  });
});
