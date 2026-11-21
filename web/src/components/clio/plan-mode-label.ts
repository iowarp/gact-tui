import { t } from '@lingui/core/macro';
import { SESSION_APPROVAL_OPTIONS } from './session-behavior-options';

/** The confirmation policy a plan's approval names, when it names one. */
export function planApprovalOption(value: string | undefined) {
  return SESSION_APPROVAL_OPTIONS.find((option) => option.value === value);
}

/**
 * Human-readable labels for a plan's approval choices: a confirmation policy
 * reads as it does in the composer, and older cards keep their auto-execute
 * and interactive modes.
 */
export function planModeLabel(value: string): string {
  const approval = planApprovalOption(value);
  if (approval) return approval.label;
  if (value === 'auto') return t`Auto-execute`;
  if (value === 'interactive') return t`Interactive`;
  if (value === 'exit_only') return t`Exit Plan mode only`;
  return value;
}
