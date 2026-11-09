import type { AcceptedParameter } from '@clio/core/v3';

export function toNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function defaultText(parameter: AcceptedParameter): string {
  return parameter.default === null ? 'Provider default' : `Default ${parameter.default}`;
}

export function rangeText(parameter: AcceptedParameter): string {
  const { minimum, maximum } = parameter;
  if (minimum !== null && maximum !== null)
    return `${minimum.toLocaleString()} to ${maximum.toLocaleString()}`;
  if (maximum !== null) return `up to ${maximum.toLocaleString()}`;
  if (minimum !== null) return `at least ${minimum.toLocaleString()}`;
  return '';
}

/** Why a typed response setting cannot be saved, or undefined when it can (empty is the default). */
export function responseSettingError(
  parameter: AcceptedParameter,
  value: string,
): string | undefined {
  if (parameter.kind === 'enum' || !value.trim()) return undefined;
  const parsed = toNumber(value);
  if (parsed === null) return 'Enter a number.';
  if (parameter.kind === 'integer' && !Number.isInteger(parsed)) return 'Enter a whole number.';
  const { minimum, maximum } = parameter;
  if ((minimum !== null && parsed < minimum) || (maximum !== null && parsed > maximum))
    return `Enter ${rangeText(parameter)}.`;
  return undefined;
}
