import type { ViewerMessage } from '@clio/hdf5-viewer/protocol';

export type ViewerEntity = Omit<Extract<ViewerMessage, { type: 'entity' }>, 'source' | 'type'>;

/** The dataset's path, then its shape and element type: `/2020/sm`, `365 × 721 × 1440`, `float32`. */
export function entityFacts(entity: ViewerEntity | undefined): string[] | undefined {
  if (!entity) return undefined;
  const facts: string[] = [];
  if (entity.locator !== '/') facts.push(entity.locator);
  if (entity.shape) facts.push(entity.shape.length ? entity.shape.join(' × ') : 'scalar');
  if (entity.dtype) facts.push(entity.dtype);
  return facts;
}

/** h5grove's JSON values as tab-separated rows: one value, a column, or a matrix. */
export function valuesAsTsv(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (!Array.isArray(value)) return String(value);
  return value
    .map((row: unknown) => (Array.isArray(row) ? row.map(String).join('\t') : String(row)))
    .join('\n');
}
