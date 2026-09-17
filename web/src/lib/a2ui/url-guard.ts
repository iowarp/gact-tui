import { checkA2uiUrlScheme } from '@clio/core/v3';
import { createContext, useContext, useEffect } from 'react';

/**
 * Reports a URL scheme violation found while rendering one bound component
 * value. `componentId`/`propName` compose the JSON pointer
 * (`/${componentId}/${propName}`) carried in the `VALIDATION_FAILED` envelope
 * — see `docs/design/a2ui-compat-campaign-2026-09.md` owner decision 11.
 */
export type A2uiUrlViolationReporter = (
  componentId: string,
  propName: string,
  message: string,
) => void;

const A2uiUrlViolationContext = createContext<A2uiUrlViolationReporter | undefined>(undefined);

export const A2uiUrlViolationProvider = A2uiUrlViolationContext.Provider;

/**
 * Checks one resolved URL value against the allowlist and reports a
 * violation exactly once per change. Returns the check result so the caller
 * can render a failure state instead of the media/artifact element.
 */
export function useA2uiUrlGuard(
  componentId: string,
  propName: string,
  value: string,
): { ok: true } | { ok: false; message: string } {
  const report = useContext(A2uiUrlViolationContext);
  const check = checkA2uiUrlScheme(value);
  useEffect(() => {
    if (!check.ok) report?.(componentId, propName, check.reason);
  }, [value, componentId, propName, report]); // eslint-disable-line react-hooks/exhaustive-deps
  return check.ok ? { ok: true } : { ok: false, message: check.reason };
}
