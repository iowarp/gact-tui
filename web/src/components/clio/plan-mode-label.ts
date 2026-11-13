import { t } from '@lingui/core/macro';
/** Human-readable labels for the backend's unchanged execution mode values. */
export function planModeLabel(value: string): string {
  if (value === 'auto') return t`Auto-execute`;
  if (value === 'interactive') return t`Interactive`;
  if (value === 'exit_only') return t`Exit Plan mode only`;
  return value;
}
