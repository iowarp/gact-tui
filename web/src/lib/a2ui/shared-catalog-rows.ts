import type { A2uiCatalogListDecodeResult, A2uiCatalogRow } from '@clio/core/v3';

/**
 * Every session's `GET .../a2ui/catalogs` repeats the same installed catalogs
 * (the builtin workspace catalog alone is ~126 KB). Rows with the same
 * identity, checksum and producibility are interchangeable, so sessions share
 * one decoded instance instead of each holding its own copy. Bounded: the key
 * space is installed catalogs × producibility, and the oldest entry goes first.
 */
const SHARED_ROW_LIMIT = 64;
const sharedRows = new Map<string, A2uiCatalogRow>();

function rowKey(row: A2uiCatalogRow): string {
  return [row.catalogId, row.protocolVersion, row.checksum, row.producible ? 'p' : '-'].join(
    '\u0000',
  );
}

export function shareA2uiCatalogRows(
  result: A2uiCatalogListDecodeResult,
): A2uiCatalogListDecodeResult {
  const rows = result.rows.map((row) => {
    // A row without a checksum cannot be proven identical to another.
    if (!row.checksum) return row;
    const key = rowKey(row);
    const shared = sharedRows.get(key);
    if (shared) {
      sharedRows.delete(key);
      sharedRows.set(key, shared);
      return shared;
    }
    sharedRows.set(key, row);
    while (sharedRows.size > SHARED_ROW_LIMIT) {
      const oldest = sharedRows.keys().next().value;
      if (oldest === undefined) break;
      sharedRows.delete(oldest);
    }
    return row;
  });
  return { ...result, rows };
}

/** Test seam: forget every shared row. */
export function resetSharedA2uiCatalogRows(): void {
  sharedRows.clear();
}
