import type { AcceptedParameter } from '@clio/core/v3';
import { ph, t } from '@lingui/core/macro';
import { formatNumber } from '@/lib/locale-format';

export function toNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function defaultText(parameter: AcceptedParameter): string {
  const value = parameter.default;
  return value === null ? t`Provider default` : t`Default ${ph({ value })}`;
}

/** "Range 0 to 2." beside a typed setting, or undefined when it is unbounded. */
export function rangeInfo(parameter: AcceptedParameter): string | undefined {
  const { minimum, maximum } = parameter;
  if (minimum !== null && maximum !== null)
    return t`Range ${ph({ minimum: formatNumber(minimum) })} to ${ph({ maximum: formatNumber(maximum) })}.`;
  if (maximum !== null) return t`Range up to ${ph({ maximum: formatNumber(maximum) })}.`;
  if (minimum !== null) return t`Range at least ${ph({ minimum: formatNumber(minimum) })}.`;
  return undefined;
}

/** "Enter 0 to 2." for a value outside the setting's bounds. */
function enterRangeText(parameter: AcceptedParameter): string {
  const { minimum, maximum } = parameter;
  if (minimum !== null && maximum !== null)
    return t`Enter ${ph({ minimum: formatNumber(minimum) })} to ${ph({ maximum: formatNumber(maximum) })}.`;
  if (maximum !== null) return t`Enter up to ${ph({ maximum: formatNumber(maximum) })}.`;
  if (minimum !== null) return t`Enter at least ${ph({ minimum: formatNumber(minimum) })}.`;
  return t`Enter a number.`;
}

/** Why a typed response setting cannot be saved, or undefined when it can (empty is the default). */
export function responseSettingError(
  parameter: AcceptedParameter,
  value: string,
): string | undefined {
  if (parameter.kind === 'enum' || !value.trim()) return undefined;
  const parsed = toNumber(value);
  if (parsed === null) return t`Enter a number.`;
  if (parameter.kind === 'integer' && !Number.isInteger(parsed)) return t`Enter a whole number.`;
  const { minimum, maximum } = parameter;
  if ((minimum !== null && parsed < minimum) || (maximum !== null && parsed > maximum))
    return enterRangeText(parameter);
  return undefined;
}
