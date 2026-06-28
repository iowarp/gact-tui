import { describe, expect, it, vi } from 'vitest';
import type { Setter } from 'solid-js';
import { asyncActionErrorMessage, runAsyncAction } from '../../src/asyncAction.js';

describe('runAsyncAction', () => {
  it('wraps a successful action with busy, error reset, before, and success hooks', async () => {
    const calls: string[] = [];
    const setBusyMock = vi.fn((busy: boolean) => calls.push(`busy:${busy}`));
    const setErrorMock = vi.fn((message: string | null) => calls.push(`error:${message}`));
    const setBusy = setBusyMock as unknown as Setter<boolean>;
    const setError = setErrorMock as unknown as Setter<string | null>;

    await runAsyncAction(
      async () => {
        calls.push('action');
      },
      {
        setBusy,
        setError,
        before: () => calls.push('before'),
        afterSuccess: () => calls.push('success'),
      },
    );

    expect(calls).toEqual(['busy:true', 'error:null', 'before', 'action', 'success', 'busy:false']);
    expect(setBusyMock).toHaveBeenLastCalledWith(false);
    expect(setErrorMock).toHaveBeenCalledWith(null);
  });

  it('captures thrown errors and skips the success hook', async () => {
    const afterSuccess = vi.fn();
    const setError = vi.fn();

    await runAsyncAction(
      async () => {
        throw new Error('failed');
      },
      { setError, afterSuccess },
    );

    expect(setError).toHaveBeenLastCalledWith('failed');
    expect(afterSuccess).not.toHaveBeenCalled();
  });
});

describe('asyncActionErrorMessage', () => {
  it('uses Error.message and stringifies non-Error failures', () => {
    expect(asyncActionErrorMessage(new Error('boom'))).toBe('boom');
    expect(asyncActionErrorMessage('plain failure')).toBe('plain failure');
  });
});
