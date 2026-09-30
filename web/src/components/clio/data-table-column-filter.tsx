import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { SEARCH_DEBOUNCE_MS } from '@/lib/runtime-limits';

/**
 * One column's server-side filter, layered on top of (never replacing) the
 * producer's own `dataQuery.filter` — `clio.data-table.v1`'s per-column
 * header controls. `text` sends a `contains` predicate; `range` sends a
 * `range` predicate with either bound optional.
 */
export type ClioColumnFilterValue =
  | { kind: 'text'; contains: string }
  | { kind: 'range'; min?: number; max?: number };

/** Debounced free-text "contains" filter for a string-like column. */
export function ClioTextColumnFilter({
  columnLabel,
  value,
  onChange,
}: {
  columnLabel: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  // Adjusts local state to an external `value` change (a server-driven reset
  // or programmatic clear) during render rather than in an Effect — see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    setDraft(value);
  }
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    const timer = window.setTimeout(() => onChangeRef.current(draft), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft]);

  return (
    <Input
      aria-label={`Filter ${columnLabel}, contains`}
      className="h-8"
      onChange={(event) => setDraft(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      placeholder="Contains…"
      value={draft}
    />
  );
}

/** Debounced min/max range filter for a numeric column. */
export function ClioRangeColumnFilter({
  columnLabel,
  value,
  onChange,
}: {
  columnLabel: string;
  value: { min?: number; max?: number };
  onChange: (value: { min?: number; max?: number }) => void;
}) {
  const [draft, setDraft] = useState(value);
  // Value-compared, not reference-compared: the caller rebuilds `{min, max}`
  // as a fresh object on every column-definitions recompute (any column's
  // filter changing), so a reference check would reset an unrelated column's
  // in-progress typing. See the text filter above for why this runs during
  // render rather than in an Effect.
  const [syncedValue, setSyncedValue] = useState(value);
  if (value.min !== syncedValue.min || value.max !== syncedValue.max) {
    setSyncedValue(value);
    setDraft(value);
  }
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    const timer = window.setTimeout(() => onChangeRef.current(draft), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft]);

  const parse = (raw: string): number | undefined => (raw === '' ? undefined : Number(raw));

  return (
    <div className="flex items-center gap-1.5">
      <Input
        aria-label={`Filter ${columnLabel}, minimum`}
        className="h-8 w-20"
        onChange={(event) => setDraft((current) => ({ ...current, min: parse(event.target.value) }))}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        placeholder="Min"
        type="number"
        value={draft.min ?? ''}
      />
      <span aria-hidden="true" className="text-xs text-muted-foreground">
        –
      </span>
      <Input
        aria-label={`Filter ${columnLabel}, maximum`}
        className="h-8 w-20"
        onChange={(event) => setDraft((current) => ({ ...current, max: parse(event.target.value) }))}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        placeholder="Max"
        type="number"
        value={draft.max ?? ''}
      />
    </div>
  );
}
