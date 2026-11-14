import { plural, ph, t } from '@lingui/core/macro';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { RemoveIcon } from '@/lib/icon-vocabulary';
import type { Vec3 } from './cad-parts';
import {
  measurementText,
  snapName,
  type CadMeasureState,
  type Measurement,
  type MeasureMode,
} from './cad-measure-state';
import type { CadScene } from './cad-scene';
import type { MeasureShape } from './cad-scene-overlays';
import { formatNumber, type LengthUnit } from './cad-units';
import { CadToolPanel } from './cad-tool-panel';

function deltaText(item: Measurement, unit: LengthUnit): string | undefined {
  if (!item.distance) return undefined;
  const [x, y, z] = item.distance.delta.map((value) => formatNumber(value, unit));
  return t`ΔX ${ph({ x })}  ΔY ${ph({ y })}  ΔZ ${ph({ z })}`;
}

/** Where a measurement's label sits: the middle of its line, or the circle's centre. */
function anchorOf(shape: MeasureShape): Vec3 {
  if (shape.circle) return shape.circle.center;
  const [a, b] = shape.points;
  return b ? (a!.map((value, axis) => (value + b[axis]!) / 2) as Vec3) : a!;
}

/** The labels of the measurements, kept on their lines as the camera moves. */
export function CadMeasureLabels({
  scene,
  measure,
  unit,
}: {
  scene: CadScene;
  measure: CadMeasureState;
  unit: LengthUnit;
}) {
  const labels = useRef(new Map<string, HTMLElement>());
  const { items, hover, shapes } = measure;
  useEffect(() => {
    const place = () => {
      for (const shape of shapes) {
        const element = labels.current.get(shape.id);
        if (!element) continue;
        const at = scene.project(anchorOf(shape));
        element.style.visibility = at ? 'visible' : 'hidden';
        if (at) element.style.transform = `translate(${at[0]}px, ${at[1]}px) translate(-50%, -50%)`;
      }
    };
    place();
    scene.requestRender();
    return scene.subscribe(place);
  }, [shapes, scene]);
  const last = items[items.length - 1];
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden" data-slot="cad-measure-labels">
      {items.map((item) => (
        <div
          className="absolute top-0 left-0 rounded-sm border border-primary/40 bg-background/90 px-1.5 py-0.5 text-caption font-medium whitespace-nowrap text-foreground tabular-nums shadow-sm"
          key={item.id}
          ref={(element) => {
            if (element) labels.current.set(item.id, element);
            else labels.current.delete(item.id);
          }}
        >
          {measurementText(item, unit)}
          {item === last && deltaText(item, unit) ? (
            <span className="block text-[0.625rem] font-normal text-muted-foreground">{deltaText(item, unit)}</span>
          ) : null}
        </div>
      ))}
      {hover ? (
        <div
          className="absolute top-0 left-0 flex items-center gap-1"
          data-slot="cad-snap"
          style={{ transform: `translate(${hover.x - 6}px, ${hover.y - 6}px)` }}
        >
          <span
            className={
              hover.kind === 'vertex'
                ? 'size-3 rounded-full border-2 border-primary bg-background'
                : hover.kind === 'edge'
                  ? 'size-3 rotate-45 border-2 border-primary bg-background'
                  : 'size-3 rounded-sm border border-primary/70'
            }
          />
          <span className="rounded-sm bg-primary px-1 text-[0.625rem] font-medium text-primary-foreground">
            {snapName(hover.kind)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** The Measure panel: the kind of measurement, how to take it, and the ones on screen. */
export function CadMeasurePanel({
  measure,
  unit,
  onClose,
}: {
  measure: CadMeasureState;
  unit: LengthUnit;
  onClose: () => void;
}) {
  const { mode, setMode, items, pending, notice, remove, clear } = measure;
  const hint =
    mode === 'radius'
      ? t`Click a round edge, such as the rim of a hole.`
      : mode === 'angle'
        ? pending
          ? t`Click the second face. Esc cancels.`
          : t`Click two faces.`
        : pending
          ? pending.snap === 'vertex'
            ? t`First point on a vertex. Click the second point; Esc cancels.`
            : pending.snap === 'edge'
              ? t`First point on an edge. Click the second point; Esc cancels.`
              : t`First point on a face. Click the second point; Esc cancels.`
          : t`Click two points. Vertices and edges snap.`;
  return (
    <CadToolPanel onClose={onClose} slot="cad-measure" title={t`Measure`}>
      <ToggleGroup
        aria-label={t`What to measure`}
        className="w-full"
        onValueChange={(next) => next && setMode(next as MeasureMode)}
        size="sm"
        type="single"
        value={mode}
        variant="outline"
      >
        <ToggleGroupItem className="flex-1" value="distance">{t`Distance`}</ToggleGroupItem>
        <ToggleGroupItem className="flex-1" value="radius">{t`Radius`}</ToggleGroupItem>
        <ToggleGroupItem className="flex-1" value="angle">{t`Angle`}</ToggleGroupItem>
      </ToggleGroup>
      <p className="text-caption text-muted-foreground" role="status">
        {notice ?? hint}
      </p>
      {items.length ? (
        <>
          <ul className="flex flex-col gap-0.5" aria-label={t`Measurements`}>
            {items.map((item, index) => {
              const deltas = deltaText(item, unit);
              const value = measurementText(item, unit);
              return (
                <li className="flex items-start gap-1 rounded-sm px-1 py-0.5 hover:bg-accent" key={item.id}>
                  <span className="w-4 shrink-0 text-caption text-muted-foreground tabular-nums">{index + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium tabular-nums">{value}</span>
                    {deltas ? (
                      <span className="block text-caption text-muted-foreground tabular-nums">{deltas}</span>
                    ) : null}
                    {item.snaps.length > 1 ? (
                      <span className="block text-caption text-muted-foreground">
                        {item.snaps.map(snapName).join(' → ')}
                      </span>
                    ) : null}
                  </span>
                  <Button
                    aria-label={t`Clear measurement ${ph({ number: index + 1 })}`}
                    className="size-6 shrink-0"
                    onClick={() => remove(item.id)}
                    size="icon"
                    variant="ghost"
                  >
                    <RemoveIcon aria-hidden="true" className="size-3.5" />
                  </Button>
                </li>
              );
            })}
          </ul>
          <Button className="h-7 self-start px-2 text-caption" onClick={clear} size="sm" variant="ghost">
            {plural(items.length, { one: 'Clear the measurement', other: 'Clear all # measurements' })}
          </Button>
        </>
      ) : null}
    </CadToolPanel>
  );
}
