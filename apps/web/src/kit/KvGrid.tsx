import type { ReactNode } from 'react';
import './kvgrid.css';

export interface KvRow {
  key: string;
  value: ReactNode;
  /** Right-hand slot — units, provenance stamps, copy affordances. */
  trailing?: ReactNode;
}

export interface KvGridProps {
  rows: KvRow[];
  /** Label for assistive tech; the grid is a definition list, not a table. */
  label?: string;
}

/**
 * The two-column key/value grid — tool params and results, version records,
 * transform records, execution views all render through this one primitive.
 *
 * Geometry is the prototype's: a 110px key column, a shrinkable value column,
 * an auto trailing slot, 14px gap, baseline alignment.
 *
 * Rendered as a <dl> so the key/value relationship survives for screen
 * readers instead of being purely visual.
 */
export function KvGrid({ rows, label }: KvGridProps) {
  return (
    <dl className="kit-kvgrid" aria-label={label}>
      {rows.map((row) => (
        <div className="kit-kvgrid__row" key={row.key}>
          <dt className="kit-kvgrid__key">{row.key}</dt>
          <dd className="kit-kvgrid__value">{row.value}</dd>
          {row.trailing ? <div className="kit-kvgrid__trailing">{row.trailing}</div> : null}
        </div>
      ))}
    </dl>
  );
}
