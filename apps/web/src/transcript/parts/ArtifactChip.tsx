import { Icon, type IconName } from '../../kit';
import type { WirePart } from '../registry';

export interface ArtifactGridProps {
  /** One or more resource_link parts minted together — always a real N,
   *  never padded or dropped. */
  parts: WirePart[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined ? '' : String(v));

/** mime_type -> the closest icon this build actually has. Falls back to the
 *  generic diamond rather than guessing a kind the wire never asserted. */
function iconFor(mimeType: string): IconName {
  if (mimeType.includes('csv') || mimeType.includes('tsv')) return 'csv';
  if (mimeType.startsWith('text/') || mimeType.includes('markdown') || mimeType.includes('json')) return 'doc';
  return 'artifact';
}

/**
 * The prototype's durable-artifact card (design/prototype/Clio Session.html
 * ~7876221): a 28px teal icon tile, a mono filename, and a mono meta line —
 * gridded under an "artifacts (N)" eyebrow. The prototype's meta line reads
 * "1,101 rows" / "412 KB", but the wire's resource_link carries neither row
 * count nor byte size (clio-agent#966 mints those into a SEPARATE artifact
 * record the transcript part doesn't reference) — clio-agent#... "E7" tracks
 * grounding the chip in that record. Until then the meta line shows the
 * part's own `description` or `mime_type`, which is real, rather than a
 * fabricated size.
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
          const meta = str(part['description']) || mimeType || 'resource';
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
                <Icon name={iconFor(mimeType)} size={13} />
              </span>
              <span className="part-artchip__text">
                <span className="part-artchip__name">{name}</span>
                <span className="part-artchip__meta">{meta}</span>
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
