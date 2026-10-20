import type { NDPEndpointConnection } from '@clio/core/v3';

export type NDPRecord = Record<string, unknown>;
/** Unwrap nullable schemas while retaining their actual field shape. */
export function concreteSchema(schema: NDPRecord): NDPRecord {
  return Array.isArray(schema.anyOf)
    ? { ...schema, ...record(schema.anyOf.find((item) => record(item).type !== 'null')) }
    : schema;
}
export function record(value: unknown): NDPRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as NDPRecord)
    : {};
}
export function records(value: unknown): NDPRecord[] {
  if (Array.isArray(value))
    return value.map((row) => (typeof row === 'string' ? { name: row } : record(row)));
  const data = record(value);
  for (const key of [
    'result',
    'results',
    'datasets',
    'organizations',
    'stations',
    'sessions',
    'files',
    'streams',
    'active_streams',
    'sources',
  ]) {
    if (data[key] !== undefined) return records(data[key]);
  }
  return [];
}
export const recordName = (row: NDPRecord): string =>
  String(
    row.title ??
      row.name ??
      row.sncl_code ??
      row.station ??
      row.filename ??
      row.session_id ??
      row.id ??
      'Unnamed',
  );
export const isService = (row: NDPRecord): boolean =>
  Boolean(record(row.extras).service_type) ||
  records(row.resources).some((item) => /service|api/i.test(String(item.format)));
export type NDPSection = { name: string; operation: string };
export function endpointSections(endpoint: NDPEndpointConnection): NDPSection[] {
  const has = (id: string) => endpoint.operations.some((row) => row.id === id);
  return [
    ...(has('GET /search') ? [{ name: 'Catalog', operation: 'GET /search' }] : []),
    ...(has('GET /organization')
      ? [{ name: 'Organizations', operation: 'GET /organization' }]
      : []),
    ...(has('GET /search') ? [{ name: 'Services', operation: 'GET /search' }] : []),
    ...(has('GET /bridge/stations/catalog')
      ? [{ name: 'Stations', operation: 'GET /bridge/stations/catalog' }]
      : []),
    ...(has('GET /data/csv-files') ? [{ name: 'Files', operation: 'GET /data/csv-files' }] : []),
    ...(has('GET /streams')
      ? [{ name: 'Streams', operation: 'GET /streams' }]
      : has('GET /bridge/sessions')
        ? [{ name: 'Streams', operation: 'GET /bridge/sessions' }]
        : has('GET /active-streams')
          ? [{ name: 'Streams', operation: 'GET /active-streams' }]
          : []),
  ];
}
export function listingParameters(section: NDPSection, query: string, server: string): NDPRecord {
  if (section.operation === 'GET /search') return { terms: [query || ''], server };
  if (section.operation === 'GET /organization') return { server };
  if (section.operation === 'GET /data/csv-files')
    return { limit: 100, ...(query ? { contains: query } : {}) };
  if (section.operation === 'GET /bridge/stations/catalog')
    return { server: 'global', limit: 2000 };
  return {};
}
