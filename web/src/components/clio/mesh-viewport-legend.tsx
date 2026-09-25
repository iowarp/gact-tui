import { formatFieldValue, legendTicks, turboGradientCss } from './mesh-viewport-colormap';
import type { MeshField } from './mesh-viewport-mesh';

export interface MeshLegendState {
  field: MeshField;
  min: number;
  max: number;
  sharedWith: number;
}

export function MeshLegend({ legend }: { legend: MeshLegendState }) {
  const ticks = legendTicks(legend.min, legend.max);
  return (
    <figure className="border-t px-3 py-2 text-xs" aria-label={`${legend.field.label} color scale`}>
      <figcaption className="mb-1 flex items-baseline justify-between gap-2">
        <span className="font-medium">
          {legend.field.label}
          {legend.field.unit ? ` (${legend.field.unit})` : ''}
        </span>
        {legend.sharedWith > 0 ? (
          <span className="text-muted-foreground">
            Same scale as{' '}
            {legend.sharedWith === 1 ? 'the linked view' : `${legend.sharedWith} linked views`}
          </span>
        ) : null}
      </figcaption>
      <div
        aria-hidden="true"
        className="h-2.5 rounded-sm"
        style={{ background: turboGradientCss() }}
      />
      <div className="mt-1 flex justify-between font-mono text-[11px] text-muted-foreground">
        {ticks.map((tick) => (
          <span key={tick}>{formatFieldValue(tick)}</span>
        ))}
      </div>
    </figure>
  );
}
