/**
 * Deterministic earthquake dataset + a minimal but real in-memory
 * table-query engine, for the "data everywhere" e2e demo
 * (`clio.chart.v1`/`clio.map.v1`/`clio.data-table.v1` all reading one
 * `dataUri` dataset, linked through one `selection` path).
 *
 * `POST /v1/artifacts/:id/table-query` does not exist anywhere else in this
 * fixture (or in clio-agent's `develop` branch yet); this mirrors the real
 * server's contract (columns projection, filter, sort, offset, limit) closely
 * enough to exercise real paging/sorting/filtering end to end in Playwright,
 * without needing a live backend.
 */

const PLACES = [
  'Southern California',
  'Northern California',
  'Nevada border',
  'Coastal ranges',
  'Central Valley',
  'Eastern Sierra',
];

/** A small, seeded PRNG so the dataset (and every screenshot) is reproducible. */
function mulberry32(seed) {
  let state = seed;
  return function random() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const EARTHQUAKE_COLUMNS = ['id', 'time', 'lat', 'lon', 'magnitude', 'depth', 'place'];

export const EARTHQUAKE_ROWS = (() => {
  const random = mulberry32(20260929);
  const baseTime = Date.parse('2026-08-01T00:00:00.000Z');
  const rows = [];
  for (let index = 0; index < 500; index += 1) {
    const magnitude = Math.round((1 + random() * random() * 6) * 100) / 100;
    const depth = Math.round((random() * 24 + 1) * 10) / 10;
    const lat = Math.round((32.2 + random() * 9.6) * 1000) / 1000;
    const lon = Math.round((-124.2 + random() * 9.8) * 1000) / 1000;
    const place = PLACES[Math.floor(random() * PLACES.length)];
    const time = new Date(baseTime + Math.floor(random() * 30 * 24 * 3600 * 1000)).toISOString();
    rows.push({
      id: `eq${String(index + 1).padStart(4, '0')}`,
      time,
      lat,
      lon,
      magnitude,
      depth,
      place,
    });
  }
  rows.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
  return rows;
})();

/** The vendored artifact's raw bytes, for a viewer that reads the file directly. */
export function earthquakeCsv() {
  const header = EARTHQUAKE_COLUMNS.join(',');
  const lines = EARTHQUAKE_ROWS.map((row) => EARTHQUAKE_COLUMNS.map((name) => row[name]).join(','));
  return [header, ...lines].join('\n');
}

function matchesFilter(row, filter) {
  const value = row[filter.column];
  switch (filter.op) {
    case 'eq':
      return value === filter.value;
    case 'in':
      return Array.isArray(filter.value) && filter.value.includes(value);
    case 'range': {
      const [min, max] = filter.value ?? [null, null];
      if (min !== null && min !== undefined && value < min) return false;
      if (max !== null && max !== undefined && value > max) return false;
      return true;
    }
    case 'isnull': {
      const wantsNull = filter.value !== false;
      const isNull = value === null || value === undefined;
      return wantsNull ? isNull : !isNull;
    }
    case 'contains':
      return (
        typeof value === 'string' &&
        value.toLowerCase().includes(String(filter.value ?? '').toLowerCase())
      );
    default:
      return true;
  }
}

/**
 * Runs one `TableQueryRequest`-shaped body against `EARTHQUAKE_ROWS`: filter,
 * then sort, then offset/limit — the same stages the real server documents
 * (aggregate/downsample are accepted but not implemented; this fixture's
 * dataset never needs them). Returns `{status, body}`, `body` shaped exactly
 * like `ArtifactTableQueryResult` on success, or the client's typed error
 * envelope (`{error: {error, message, details}}`) on a refusal.
 */
export function runEarthquakeTableQuery(request) {
  const columns =
    Array.isArray(request.columns) && request.columns.length ? request.columns : EARTHQUAKE_COLUMNS;
  const missing = columns.filter((name) => !EARTHQUAKE_COLUMNS.includes(name));
  if (missing.length > 0) {
    return {
      status: 400,
      body: {
        error: {
          error: 'columns_not_found',
          message: 'one or more requested columns do not exist',
          details: { missing },
        },
      },
    };
  }

  let filtered = EARTHQUAKE_ROWS;
  for (const filter of request.filter ?? []) {
    filtered = filtered.filter((row) => matchesFilter(row, filter));
  }
  const matchedRows = filtered.length;

  // `sort` is a LIST of `{column, desc}` keys, applied in order (a stable,
  // compound sort) — the real server's contract (clio-agent
  // `TableQueryRequest.sort: list[TableSort]`), not a single `{column,
  // direction}` object.
  const sortKeys = Array.isArray(request.sort) ? request.sort : [];
  let sorted = filtered;
  if (sortKeys.length) {
    sorted = [...filtered].sort((a, b) => {
      for (const { column, desc } of sortKeys) {
        const left = a[column];
        const right = b[column];
        if (left === right) continue;
        const ascending = left < right ? -1 : 1;
        return desc ? -ascending : ascending;
      }
      return 0;
    });
  }

  const offset = Number.isInteger(request.offset) && request.offset >= 0 ? request.offset : 0;
  const limit = Number.isInteger(request.limit) && request.limit > 0 ? request.limit : sorted.length;
  const page = sorted.slice(offset, offset + limit);

  const columnsOut = {};
  for (const name of columns) columnsOut[name] = page.map((row) => row[name] ?? null);

  return {
    status: 200,
    body: {
      // Arrow-derived type strings, matching the real server
      // (`str(pyarrow.DataType)`: `double`, `string`, ...) — not the
      // generic `typeof` name a fixture could otherwise shortcut to.
      schema: columns.map((name) => ({
        name,
        type: typeof EARTHQUAKE_ROWS[0][name] === 'number' ? 'double' : 'string',
      })),
      columns: columnsOut,
      rowKey: {
        column: '__row',
        values: page.map((row) => EARTHQUAKE_ROWS.indexOf(row)),
      },
      totalRows: EARTHQUAKE_ROWS.length,
      matchedRows,
      returnedRows: page.length,
      truncated: offset + page.length < matchedRows,
      downsample: { mode: 'none' },
    },
  };
}
