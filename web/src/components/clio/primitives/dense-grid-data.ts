export interface DenseGridColumn {
  key: string;
  label: string;
}

export type DenseGridRow = Readonly<Record<string, unknown>>;

export interface DenseGridSort {
  key: string;
  desc: boolean;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** The stored text of a value: what Copy writes and a cell's hover name shows. */
export function denseGridRawText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function compareValues(left: unknown, right: unknown): number {
  if (typeof left === 'number' && typeof right === 'number') {
    return left < right ? -1 : left > right ? 1 : 0;
  }
  return collator.compare(denseGridRawText(left), denseGridRawText(right));
}

/** Row indexes in display order; empty values sort last in both directions. */
export function denseGridOrder(
  rows: readonly DenseGridRow[],
  sort: DenseGridSort | undefined,
): number[] {
  const order = rows.map((_, index) => index);
  if (!sort) return order;
  return order.sort((left, right) => {
    const a = rows[left][sort.key];
    const b = rows[right][sort.key];
    const emptyA = isEmpty(a);
    const emptyB = isEmpty(b);
    if (emptyA || emptyB) return emptyA === emptyB ? left - right : emptyA ? 1 : -1;
    const compared = compareValues(a, b);
    return (sort.desc ? -compared : compared) || left - right;
  });
}

function tsvField(text: string): string {
  return /[\t\n\r"]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Tab-separated text of every row in display order, with a header line. */
export function denseGridText(
  columns: readonly DenseGridColumn[],
  rows: readonly DenseGridRow[],
  order: readonly number[] = rows.map((_, index) => index),
): string {
  const lines = [columns.map((column) => tsvField(column.label)).join('\t')];
  for (const index of order) {
    const row = rows[index];
    lines.push(columns.map((column) => tsvField(denseGridRawText(row[column.key]))).join('\t'));
  }
  return lines.join('\n');
}

const gridText = new WeakMap<Element, () => string>();

/** Lets `readDenseGridText` build `element`'s text; returns the unregister. */
export function registerDenseGridText(element: Element, read: () => string): () => void {
  gridText.set(element, read);
  return () => {
    gridText.delete(element);
  };
}

/**
 * The text of every dense grid in `container` (or `container` itself), built
 * from the rows rather than the mounted DOM, so a windowed grid copies all of
 * its rows. `undefined` when there is no grid.
 */
export function readDenseGridText(container: Element | null): string | undefined {
  if (!container) return undefined;
  const readers = [container, ...container.querySelectorAll('[data-slot="dense-grid"]')]
    .map((element) => gridText.get(element))
    .filter((reader) => reader !== undefined);
  return readers.length ? readers.map((reader) => reader()).join('\n\n') : undefined;
}
