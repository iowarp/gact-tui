import { useEffect, useState, type ReactNode } from 'react';
import { queryFilterSchema } from './data-query-schema';
import type { TableDataQuery } from './table-query-rows';

interface DataContextLike {
  resolveDynamicValue: (value: never) => unknown;
  subscribeDynamicValue: (value: never, onChange: (value: unknown) => void) => { unsubscribe: () => void };
}

function bindingPath(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 1 && typeof record.path === 'string'
    ? record.path
    : undefined;
}

// A native datetime-local control writes wall time without a zone. Arrow's
// timestamp query requires an explicit zone, so interpret that wall time in
// the browser's local zone before sending a bound filter to the server.
function normalizeBoundDateTime(value: unknown): unknown {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/u.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString().replace(/\.\d{3}Z$/u, 'Z');
  }
  if (Array.isArray(value)) return value.map(normalizeBoundDateTime);
  return value;
}

/** Resolve a control's data-model path into a live local table query. */
export function BoundDataQuery({
  children,
  dataContext,
  query,
}: {
  children: (query: TableDataQuery | undefined) => ReactNode;
  dataContext: DataContextLike;
  query: TableDataQuery | undefined;
}) {
  const [, setRevision] = useState(0);
  const bindings = query?.filter?.filter((entry) => bindingPath(entry.value)) ?? [];
  const bindingKey = JSON.stringify(bindings.map((entry) => entry.value));
  useEffect(() => {
    const subscriptions = bindings.map((entry) =>
      dataContext.subscribeDynamicValue(entry.value as never, () => setRevision((current) => current + 1)),
    );
    return () => subscriptions.forEach((subscription) => subscription.unsubscribe());
    // The serialized paths describe the subscriptions; other query changes
    // are read on render without replacing listeners.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bindingKey, dataContext]);

  if (!bindings.length) return <>{children(query)}</>;
  const filter = query!.filter!.map((entry) => {
    const path = bindingPath(entry.value);
    if (!path) return entry;
    const value = normalizeBoundDateTime(dataContext.resolveDynamicValue(entry.value as never));
    return { ...entry, value };
  });
  for (let index = 0; index < filter.length; index += 1) {
    const result = queryFilterSchema.safeParse(filter[index]);
    if (!result.success) {
      const original = query!.filter![index]!;
      return (
        <p className="py-3 text-sm text-destructive" role="alert">
          View unavailable: filter “{original.column}” bound to {bindingPath(original.value)} has no valid {original.op} value.
        </p>
      );
    }
  }
  return <>{children({ ...query, filter } as TableDataQuery)}</>;
}
