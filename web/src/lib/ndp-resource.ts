import type { NDPDataset } from '@clio/core/v3';
import { t } from '@lingui/core/macro';

type NDPResource = NDPDataset['resources'][number];

/** A catalog resource is a file, a live stream, or a web service. */
export type NDPResourceKind = 'file' | 'stream' | 'service';

const STREAM_FORMAT = /\b(kafka|stream)\b/i;
const SERVICE_FORMAT =
  /\b(api|rest|wms|wcs|wfs|wmts|ogc|arcgis|esri|service|server|thredds|opendap)\b/i;

export function ndpResourceKind(resource: Pick<NDPResource, 'format'>): NDPResourceKind {
  if (STREAM_FORMAT.test(resource.format)) return 'stream';
  if (SERVICE_FORMAT.test(resource.format)) return 'service';
  return 'file';
}

/**
 * Spec `.zx .t`: one quiet trailing word. The size when the catalog knows it,
 * "Service" for a web service, else the format. A stream pins its start
 * button there instead.
 */
export function ndpResourceMeta(
  resource: Pick<NDPResource, 'format' | 'size'>,
): string | undefined {
  const kind = ndpResourceKind(resource);
  if (kind === 'service') return t`Service`;
  if (kind === 'stream' || resource.size > 0) return undefined;
  return resource.format.trim() || undefined;
}

/** A name a file-type icon can read: catalog names rarely carry an extension. */
export function ndpResourceIconName(resource: Pick<NDPResource, 'format' | 'name'>): string {
  if (/\.[a-z0-9]{1,6}$/i.test(resource.name)) return resource.name;
  const extension = resource.format.trim().toLowerCase().replace(/\s+/g, '');
  return extension ? `${resource.name}.${extension}` : resource.name;
}

/** The text "Add to message" puts in the composer for a catalog resource. */
export function ndpResourceMessageText(resource: NDPResource, dataset: NDPDataset): string {
  const format = resource.format.trim();
  const where = dataset.title || dataset.name;
  // i18n-ignore: a reference the agent reads, kept in English
  return `NDP resource "${resource.name}"${format ? ` (${format})` : ''} from dataset "${where}": ${resource.path}`;
}
