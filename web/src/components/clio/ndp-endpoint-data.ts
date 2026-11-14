import type { NDPEndpointConnection } from '@clio/core/v3';
import { plural, t } from '@lingui/core/macro';

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
      row.topic ??
      row.name ??
      row.sncl_code ??
      row.station ??
      row.filename ??
      row.session_id ??
      row.id ??
      t`Unnamed`,
  );
export const isService = (row: NDPRecord): boolean =>
  Boolean(record(row.extras).service_type) ||
  records(row.resources).some((item) => /service|api/i.test(String(item.format)));
/** A data view's stable id; its displayed words come from `NDP_SECTION_COPY`. */
export type NDPSectionName =
  | 'Catalog'
  | 'Organizations'
  | 'Services'
  | 'Stations'
  | 'Files'
  | 'Streams';
export type NDPSection = { name: NDPSectionName; operation: string };

/** Each data view's words, as whole messages (no lowercased or spliced view names). */
export const NDP_SECTION_COPY: Record<
  NDPSectionName,
  {
    label: string;
    search: string;
    placeholder: string;
    loading: string;
    empty: string;
    results: string;
    count: (count: number) => string;
  }
> = {
  Catalog: {
    label: t`Catalog`,
    search: t`Search catalog`,
    placeholder: t`Search catalog…`,
    loading: t`Loading catalog`,
    empty: t`No catalog returned by this Endpoint.`,
    results: t`Catalog results`,
    count: (count) => plural(count, { one: '# dataset', other: '# datasets' }),
  },
  Organizations: {
    label: t`Organizations`,
    search: t`Search organizations`,
    placeholder: t`Search organizations…`,
    loading: t`Loading organizations`,
    empty: t`No organizations returned by this Endpoint.`,
    results: t`Organizations results`,
    count: (count) => plural(count, { one: '# organization', other: '# organizations' }),
  },
  Services: {
    label: t`Services`,
    search: t`Search services`,
    placeholder: t`Search services…`,
    loading: t`Loading services`,
    empty: t`No services returned by this Endpoint.`,
    results: t`Services results`,
    count: (count) => plural(count, { one: '# service', other: '# services' }),
  },
  Stations: {
    label: t`Stations`,
    search: t`Search stations`,
    placeholder: t`Search stations…`,
    loading: t`Loading stations`,
    empty: t`No stations returned by this Endpoint.`,
    results: t`Stations results`,
    count: (count) => plural(count, { one: '# station', other: '# stations' }),
  },
  Files: {
    label: t`Files`,
    search: t`Search files`,
    placeholder: t`Search files…`,
    loading: t`Loading files`,
    empty: t`No files returned by this Endpoint.`,
    results: t`Files results`,
    count: (count) => plural(count, { one: '# file', other: '# files' }),
  },
  Streams: {
    label: t`Streams`,
    search: t`Search streams`,
    placeholder: t`Search streams…`,
    loading: t`Loading streams`,
    empty: t`No streams returned by this Endpoint.`,
    results: t`Streams results`,
    count: (count) => plural(count, { one: '# stream', other: '# streams' }),
  },
};
const section = (name: NDPSectionName, operation: string): NDPSection => ({ name, operation });
export function endpointSections(endpoint: NDPEndpointConnection): NDPSection[] {
  const has = (id: string) => endpoint.operations.some((row) => row.id === id);
  return [
    ...(has('GET /search') ? [section('Catalog', 'GET /search')] : []), // i18n-ignore: NDP operation id
    ...(has('GET /organization') ? [section('Organizations', 'GET /organization')] : []), // i18n-ignore: NDP operation id
    ...(has('GET /search') ? [section('Services', 'GET /search')] : []), // i18n-ignore: NDP operation id
    ...(has('GET /bridge/stations/catalog')
      ? [section('Stations', 'GET /bridge/stations/catalog')] // i18n-ignore: NDP operation id
      : []),
    ...(has('GET /data/csv-files') ? [section('Files', 'GET /data/csv-files')] : []), // i18n-ignore: NDP operation id
    ...(has('SDK streaming_v2.list')
      ? [section('Streams', 'SDK streaming_v2.list')] // i18n-ignore: NDP operation id
      : has('GET /streams')
        ? [section('Streams', 'GET /streams')] // i18n-ignore: NDP operation id
        : has('GET /bridge/sessions')
          ? [section('Streams', 'GET /bridge/sessions')] // i18n-ignore: NDP operation id
          : has('GET /active-streams')
            ? [section('Streams', 'GET /active-streams')] // i18n-ignore: NDP operation id
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
