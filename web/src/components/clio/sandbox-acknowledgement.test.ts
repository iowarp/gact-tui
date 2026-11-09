import { describe, expect, it } from 'vitest';
import { sandboxReasonLabel, sandboxVerdict } from './sandbox-acknowledgement';

describe('sandboxVerdict', () => {
  it('waits while nothing is read or the server has not resolved its fence', () => {
    expect(sandboxVerdict(undefined)).toBe('pending');
    expect(
      sandboxVerdict({ status: 'degraded', resolved: false, acknowledgement_required: false }),
    ).toBe('pending');
  });

  it('follows acknowledgement_required when the server sends it', () => {
    expect(
      sandboxVerdict({
        status: 'ready',
        resolved: true,
        active: true,
        acknowledgement_required: false,
      }),
    ).toBe('active');
    expect(
      sandboxVerdict({
        status: 'degraded',
        resolved: true,
        active: false,
        acknowledgement_required: true,
        mechanism: 'none',
        reason: 'codex_not_installed',
        warning: 'Agent commands will run without OS isolation.',
        next_action: 'Reinstall CLIO Desktop.',
      }),
    ).toMatchObject({
      warning: 'Agent commands will run without OS isolation.',
      reason: 'Codex not installed',
      nextAction: 'Reinstall CLIO Desktop.',
    });
  });

  it('treats a fence awaiting restart as inactive from `active` alone', () => {
    const verdict = sandboxVerdict({
      status: 'degraded',
      active: false,
      reason: 'sandbox_fence_pending_restart',
    });
    expect(verdict).toMatchObject({ reason: sandboxReasonLabel('sandbox_fence_pending_restart') });
  });

  it('reads an older server’s doctor row: anything but ready is inactive unless optional', () => {
    expect(sandboxVerdict({ status: 'ready' })).toBe('active');
    expect(sandboxVerdict({ status: 'not_required', required: false })).toBe('active');
    expect(sandboxVerdict({ status: 'unavailable', summary: 'No fence.' })).toMatchObject({
      reason: 'No fence.',
    });
  });

  it('keys the verdict so a different reason asks again', () => {
    const first = sandboxVerdict({ status: 'degraded', active: false, reason: 'a' });
    const second = sandboxVerdict({ status: 'degraded', active: false, reason: 'b' });
    expect(
      typeof first === 'object' && typeof second === 'object' && first.key !== second.key,
    ).toBe(true);
  });
});
