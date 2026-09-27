/**
 * The value a linked selection holds at `/selection/<key>` in a surface's data
 * model — clio-schemas 0.5.0 `$defs/SelectionState`: the selected values of
 * one data field, and the id of the component that made the selection.
 *
 * Components bound to the same path share one selection entirely on the
 * client: each writes through the generic binder's setter
 * (`dataContext.set`) and reads the bound value back, so linking never waits
 * for a server round trip. `source` lets a component ignore its own echo.
 */
export type SelectionValue = string | number;

export interface SelectionState {
  field: string;
  values: SelectionValue[];
  source?: string;
}

/** Mirrors `$defs/SelectionState` caps (clio-workspace/v1 catalog). */
const FIELD_MAX_CHARS = 128;
const VALUES_MAX = 10_000;

function isBoundedName(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= FIELD_MAX_CHARS;
}

export function isSelectionValue(value: unknown): value is SelectionValue {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
}

/** The bound value as a `SelectionState`, or `undefined` when it is absent or not one. */
export function parseSelectionState(value: unknown): SelectionState | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== 'field' && key !== 'values' && key !== 'source')) {
    return undefined;
  }
  const { field, values, source } = record;
  if (!isBoundedName(field)) return undefined;
  if (!Array.isArray(values) || values.length > VALUES_MAX || !values.every(isSelectionValue)) {
    return undefined;
  }
  if (source !== undefined && !isBoundedName(source)) return undefined;
  return source === undefined ? { field, values } : { field, values, source };
}

/** Order-insensitive identity of a selection's content (the source is not part of it). */
export function selectionKey(field: string, values: readonly SelectionValue[]): string {
  const sorted = values
    .map((value) => `${typeof value === 'number' ? 'n' : 's'}:${String(value)}`)
    .sort();
  return JSON.stringify([field, sorted]);
}

/** Whether `value` (a row or point's value of `state.field`) is selected. */
export function selectionIncludes(state: SelectionState | undefined, value: unknown): boolean {
  if (!state || !isSelectionValue(value)) return false;
  // A numeric id may arrive as a string from a producer, or the other way round.
  return state.values.some((selected) => selected === value || String(selected) === String(value));
}

/** The writer the generic binder creates for a bound `selection` prop. */
export type SelectionWriter = (value: SelectionState) => void;

/** Whether a raw (unresolved) prop is a data-model binding, so writing it back means something. */
export function isBoundToPath(raw: unknown): boolean {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) && 'path' in raw;
}
