import type { ArtifactTableExportRequest } from '@clio/core/v3';
import { downloadBytes, downloadText, rowsToCsv, rowsToJson } from './surface-export';
import { artifactIdFromDataUri, type QueryRow } from './table-query-rows';

/**
 * Download for a `dataUri` chart/map/table (G0): the server's
 * `table-export` route, reusing the exact filter/aggregate/downsample/sort
 * the viewer is currently showing (``scope: "current"``) or the whole,
 * unfiltered dataset (``scope: "full"``). Shared by every component that
 * reads rows through `table-query-rows.ts`'s `useTableQueryRows`, so a
 * download never duplicates query-building logic per component.
 */

export type ServerExportFormat = ArtifactTableExportRequest['format'];
export type ServerExportScope = ArtifactTableExportRequest['scope'];

const EXPORT_MIME_TYPES: Record<ServerExportFormat, string> = {
  csv: 'text/csv',
  json: 'application/json',
  parquet: 'application/vnd.apache.parquet',
};

export interface ServerExportQuery {
  columns?: readonly string[];
  filter?: ArtifactTableExportRequest['filter'];
  aggregate?: ArtifactTableExportRequest['aggregate'];
  downsample?: ArtifactTableExportRequest['downsample'];
  sort?: ArtifactTableExportRequest['sort'];
}

export interface TableExportRepository {
  artifactTableExport: (
    artifactId: string,
    query: ArtifactTableExportRequest,
    signal?: AbortSignal,
  ) => Promise<Uint8Array>;
}

/** Fetches and downloads one server-side export; throws if `dataUri` is not a registered artifact. */
export async function downloadServerTableExport({
  dataUri,
  filenameStem,
  format,
  query,
  repository,
  scope,
}: {
  repository: TableExportRepository;
  dataUri: string;
  query: ServerExportQuery;
  scope: ServerExportScope;
  format: ServerExportFormat;
  filenameStem: string;
}): Promise<void> {
  const artifactId = artifactIdFromDataUri(dataUri);
  if (!artifactId) throw new Error('the data source is not a registered artifact id.');
  const bytes = await repository.artifactTableExport(artifactId, { ...query, format, scope });
  downloadBytes(bytes, EXPORT_MIME_TYPES[format], `${filenameStem}.${scope}.${format}`);
}

/** CSV download for INLINE rows (no `dataUri`, so no server route to export through). */
export function downloadInlineRowsAsCsv(
  columns: readonly string[],
  rows: readonly QueryRow[],
  filenameStem: string,
): void {
  downloadText(rowsToCsv(columns, rows), 'text/csv', `${filenameStem}.csv`);
}

/** JSON download for INLINE rows (no `dataUri`, so no server route to export through). */
export function downloadInlineRowsAsJson(
  columns: readonly string[],
  rows: readonly QueryRow[],
  filenameStem: string,
): void {
  downloadText(rowsToJson(columns, rows), 'application/json', `${filenameStem}.json`);
}
