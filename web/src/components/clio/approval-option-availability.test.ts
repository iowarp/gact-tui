import { describe, expect, it } from 'vitest';
import { approvalOptionViews } from './approval-option-availability';
import { SESSION_APPROVAL_OPTIONS } from './session-behavior-options';

const unavailable = {
  available: false,
  reason: 'spotter_watcher_blueprint_not_installed',
  message: 'SPOTTER needs its watcher Agent Blueprint, which is not installed.',
  remedy: 'install the spotter-ai Agent Blueprint from the marketplace',
};

describe('approvalOptionViews', () => {
  it('disables SPOTTER review with the remedy when the service cannot arm it', () => {
    const spotter = approvalOptionViews(SESSION_APPROVAL_OPTIONS, unavailable).find(
      (option) => option.value === 'spotter-ai',
    );
    expect(spotter).toMatchObject({
      disabled: true,
      description:
        'Unavailable. To enable: Install the spotter-ai Agent Blueprint from the marketplace.',
      unavailableDetail: unavailable.message,
    });
  });

  it('never disables the other policies', () => {
    const views = approvalOptionViews(SESSION_APPROVAL_OPTIONS, unavailable);
    expect(views.filter((option) => option.disabled).map((option) => option.value)).toEqual([
      'spotter-ai',
    ]);
  });

  it('keeps SPOTTER review selectable when available or not yet known', () => {
    for (const spotter of [undefined, { ...unavailable, available: true, reason: '' }]) {
      const view = approvalOptionViews(SESSION_APPROVAL_OPTIONS, spotter).find(
        (option) => option.value === 'spotter-ai',
      );
      expect(view?.disabled).toBe(false);
      expect(view?.description).toBe('Require the configured SPOTTER policy.');
    }
  });
});
