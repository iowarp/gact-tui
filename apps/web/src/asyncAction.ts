/**
 * Helpers for one-shot async UI actions: normalising thrown errors into a
 * user-facing message string (`asyncActionErrorMessage`).
 */
import type { Setter } from 'solid-js';

export function asyncActionErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface AsyncActionOptions {
  setBusy?: Setter<boolean>;
  setError?: Setter<string | null>;
  before?: () => void;
  afterSuccess?: () => void;
}

export async function runAsyncAction(
  action: () => Promise<void>,
  options: AsyncActionOptions = {},
): Promise<void> {
  options.setBusy?.(true);
  options.setError?.(null);
  options.before?.();
  try {
    await action();
    options.afterSuccess?.();
  } catch (error) {
    options.setError?.(asyncActionErrorMessage(error));
  } finally {
    options.setBusy?.(false);
  }
}
