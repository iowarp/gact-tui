import { Icon, type IconName } from '../../kit';
import { humanSize } from '../../wire/presentationUtils';
import type { WirePart } from '../registry';

export interface ArtifactGridProps {
  /** One or more resource_link parts minted together — always a real N,
   *  never padded or dropped. */
  parts: WirePart[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined ? '' : String(v));

function metadataOf(part: WirePart): Record<string, unknown> {
  const meta = part['metadata'];
  return meta && typeof meta === 'object' && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {};
}

/** clio-agent's `ArtifactKind` (gact/artifacts/wire.py:resource_link_metadata,
 *  `metadata.kind`) -> the closest icon this build has. Preferred over the
 *  mime-type guess below when present, since it is the backend's own curated
 *  classification rather than a suffix sniff. `ui_payload`/`other`/absent
 *  fall through to `iconForMime` rather than guessing a kind the wire never
 *  asserted. */
function iconForKind(kind: string): IconName | null {
  switch (kind) {
    case 'dataset':
      return 'csv';
    case 'image':
      return 'image';
    case 'report':
      return 'doc';
    case 'script':
      return 'term';
    case 'config':
      return 'conf';
    case 'model':
      return 'bin';
    default:
      return null;
  }
}

/** mime_type -> the closest icon this build actually has. Falls back to the
 *  generic diamond rather than guessing a kind the wire never asserted. */
function iconForMime(mimeType: string): IconName {
  if (mimeType.includes('csv') || mimeType.includes('tsv')) return 'csv';
  if (mimeType.startsWith('text/') || mimeType.includes('markdown') || mimeType.includes('json')) return 'doc';
  return 'artifact';
}

/**
 * The prototype's durable-artifact card (design/prototype/Clio Session.html
 * ~7876221): a 28px teal icon tile, a mono filename, and a mono meta line —
 * gridded under an "artifacts (N)" eyebrow. The prototype's meta line reads
 * "1,101 rows" (dataset) / "412 KB" (image) / "46 lines" (report).
 *
 * clio-agent#966.9 (gact/artifacts/wire.py:resource_link_metadata, test-
 * locked to exactly 11 keys) mints `{artifact_id, sha256, size_bytes, kind,
 * version, custody, fetch_url, producer_activity_id, mechanism, workspace_id,
 * name}` onto EVERY real artifact resource_link's `metadata` — live-confirmed
 * (sess_db1a38403472, visualization task: metadata.size_bytes=123120,
 * metadata.kind="image"). A prior pass read this as unavailable; it is real
 * and always present for an artifact-minted resource_link. The meta line
 * grounds in that real byte size (via the shared `humanSize` formatter,
 * matching the prototype's own "412 KB" unit convention) instead of the
 * part's bare description/mime_type. What genuinely remains NOT on the wire
 * is a row/line COUNT (the prototype's "1,101 rows" / "46 lines" wording for
 * dataset/report kinds specifically) — no such field exists anywhere in the
 * metadata block, so a dataset or report artifact's meta line honestly shows
 * its real byte size instead of a fabricated count. A resource_link with no
 * `metadata` at all (older/synthetic fixtures, or a link that isn't a
 * clio-artifacts mint) falls back to description/mime_type, same as before.
 */
export function ArtifactGrid({ parts }: ArtifactGridProps) {
  if (parts.length === 0) return null;
  return (
    <div className="part-artgrid" data-testid="part-artifacts">
      <span className="part-artgrid__label">artifacts ({parts.length})</span>
      <div className="part-artgrid__grid">
        {parts.map((part, index) => {
          const uri = str(part['uri']);
          const name = str(part['name'] ?? uri) || 'artifact';
          const mimeType = str(part['mime_type']);
          const meta = metadataOf(part);
          const kind = str(meta['kind']);
          const sizeBytes = meta['size_bytes'];
          const realSize =
            typeof sizeBytes === 'number' && Number.isFinite(sizeBytes) ? humanSize(sizeBytes) : '';
          const metaLine = realSize || str(part['description']) || mimeType || 'resource';
          const icon = iconForKind(kind) ?? iconForMime(mimeType);
          return (
            <a
              key={uri || index}
              className="part-artchip"
              href={uri || undefined}
              target="_blank"
              rel="noreferrer"
              title={name}
            >
              <span className="part-artchip__icon">
                <Icon name={icon} size={13} />
              </span>
              <span className="part-artchip__text">
                <span className="part-artchip__name">{name}</span>
                <span className="part-artchip__meta">{metaLine}</span>
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
