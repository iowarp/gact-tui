import { DATA_SCALE_EXEMPTION } from '@/theme/data-scales';
import { formatFieldValue, legendTicks, turboGradientCss } from './mesh-viewport-colormap';
import type { MeshField } from './mesh-viewport-mesh';
import { t, ph, plural } from '@lingui/core/macro';

export interface MeshLegendState {
  field: MeshField;
  min: number;
  max: number;
  sharedWith: number;
}

export function MeshLegend({ legend }: { legend: MeshLegendState }) {
  const ticks = legendTicks(legend.min, legend.max);
  return (
    <figure
      className="border-t px-3 py-2 text-xs"
      aria-label={t`${ph({ label: legend.field.label })} color scale`}
    >
      <figcaption className="mb-1 flex items-baseline justify-between gap-2">
        <span className="font-medium">
          {legend.field.label}
          {legend.field.unit ? ` (${legend.field.unit})` : ''}
        </span>
        {legend.sharedWith > 0 ? (
          <span className="text-muted-foreground">
            {plural(legend.sharedWith, {
              one: 'Same scale as the linked view',
              other: 'Same scale as # linked views',
            })}
          </span>
        ) : null}
      </figcaption>
      <div
        aria-hidden="true"
        className="h-2.5 rounded-sm"
        style={{ background: turboGradientCss() }}
        {...DATA_SCALE_EXEMPTION}
      />
      <div className="mt-1 flex justify-between font-mono text-xs text-muted-foreground">
        {ticks.map((tick) => (
          <span key={tick}>{formatFieldValue(tick)}</span>
        ))}
      </div>
    </figure>
  );
}
