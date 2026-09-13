/** Human-readable labels for the backend's unchanged execution mode values. */
export function planModeLabel(value: string): string {
  if (value === 'auto') return 'Auto-execute';
  if (value === 'interactive') return 'Interactive';
  if (value === 'exit_only') return 'Exit Plan mode only';
  return value;
}
