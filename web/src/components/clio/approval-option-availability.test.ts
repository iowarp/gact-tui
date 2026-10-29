import { describe, expect, it } from 'vitest';
import { approvalOptionViews, unavailableApprovalNotice } from './approval-option-availability';
import { SESSION_APPROVAL_OPTIONS } from './session-behavior-options';

const unavailable = {
  available: false,
  reason: 'spotter_watcher_agent_not_installed',
  message: 'SPOTTER needs its watcher agent, which is not installed.',
  remedy: 'install the marketplace that provides the clio/spotter-ai agent',
  verified: '',
};

describe('approvalOptionViews', () => {
  it('keeps an unavailable SPOTTER concise and retains the diagnostic detail', () => {
    const spotter = approvalOptionViews(SESSION_APPROVAL_OPTIONS, unavailable).find(
      (option) => option.value === 'spotter-ai',
    );
    expect(spotter).toMatchObject({
      disabled: true,
      description: 'Not available here.',
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
      expect(view?.description).toBe('An AI agent watches the session.');
    }
  });

  it('keeps the same concise explanation after a static setup check', () => {
    const view = approvalOptionViews(SESSION_APPROVAL_OPTIONS, {
      ...unavailable,
      available: true,
      reason: '',
      verified: 'static',
    }).find((option) => option.value === 'spotter-ai');
    expect(view?.disabled).toBe(false);
    expect(view?.description).toBe('An AI agent watches the session.');
  });
});

describe('unavailableApprovalNotice', () => {
  it('names unavailable policies concisely and stays empty when all are available', () => {
    expect(
      unavailableApprovalNotice(approvalOptionViews(SESSION_APPROVAL_OPTIONS, unavailable)),
    ).toBe('SPOTTER review: Not available here.');
    expect(
      unavailableApprovalNotice(approvalOptionViews(SESSION_APPROVAL_OPTIONS, undefined)),
    ).toBe('');
  });
});
