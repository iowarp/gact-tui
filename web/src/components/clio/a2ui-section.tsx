import { useQuery } from '@tanstack/react-query';
import type { ArtifactSectionSample } from '@clio/core/v3';
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { t, ph } from '@lingui/core/macro';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import {
  DATA_SCALE_EXEMPTION,
  colormapGradient,
  colormapRgb,
  type Colormap,
} from '@/theme/data-scales';
import { readThemeColor } from '@/theme/runtime';
import { useCanvasSize } from './use-canvas-size';
import { axisTicks, contourLevels, contourSegments } from './field-contours';
import { LoadingFailure, LoadingFeedback } from './loading-feedback';
import { parseSelectionState, type SelectionWriter } from './selection-state';

export interface SectionProps {
  componentId: string;
  sectionUri: string;
  title?: string;
  variable?: string;
  variables?: string[];
  colormap?: Colormap;
  valueRange?: [number, number];
  unit?: string;
  contourInterval?: number;
  invertVertical?: boolean;
  selection?: unknown;
  selectionField?: string;
  setSelection?: SelectionWriter;
  writePointer?: (point: unknown) => void;
  height?: number;
}

const MARGIN = { left: 56, right: 12, top: 18, bottom: 34 };

function draw(
  canvas: HTMLCanvasElement,
  sample: ArtifactSectionSample,
  options: {
    map: Colormap;
    range: [number, number];
    interval?: number;
    down: boolean;
    selected: ReadonlySet<string>;
  },
): void {
  const width = canvas.clientWidth || 640;
  const height = canvas.clientHeight || 320;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.scale(ratio, ratio);
  context.clearRect(0, 0, width, height);
  const plotW = width - MARGIN.left - MARGIN.right;
  const plotH = height - MARGIN.top - MARGIN.bottom;
  const columns = sample.distance.length;
  const rows = sample.levels.length;
  const [low, high] = options.range;
  // Field: one rectangle per sample cell, in data order (rows are levels).
  const image = context.createImageData(columns, rows);
  sample.values.forEach((row, r) =>
    row.forEach((value, c) => {
      const offset = (r * columns + c) * 4;
      if (value === null) return;
      const [red, green, blue] = colormapRgb(options.map, (value - low) / (high - low));
      image.data.set([red, green, blue, 255], offset);
    }),
  );
  const buffer = document.createElement('canvas');
  buffer.width = columns;
  buffer.height = rows;
  buffer.getContext('2d')?.putImageData(image, 0, 0);
  context.imageSmoothingEnabled = false;
  context.save();
  if (!options.down) {
    context.translate(0, MARGIN.top * 2 + plotH);
    context.scale(1, -1);
  }
  context.drawImage(buffer, MARGIN.left, MARGIN.top, plotW, plotH);
  // Contours.
  context.strokeStyle = readThemeColor('foreground');
  context.globalAlpha = 0.55;
  context.lineWidth = 0.8;
  const sx = plotW / Math.max(columns - 1, 1);
  const sy = plotH / Math.max(rows - 1, 1);
  for (const level of contourLevels(sample.min ?? low, sample.max ?? high, options.interval)) {
    context.beginPath();
    for (const [[x0, y0], [x1, y1]] of contourSegments(sample.values, level)) {
      context.moveTo(MARGIN.left + x0 * sx, MARGIN.top + y0 * sy);
      context.lineTo(MARGIN.left + x1 * sx, MARGIN.top + y1 * sy);
    }
    context.stroke();
  }
  context.restore();
  context.globalAlpha = 1;
  // Stations along the top.
  const d0 = sample.distance[0] ?? 0;
  const d1 = sample.distance[sample.distance.length - 1] ?? 1;
  for (const station of sample.stations) {
    const x = MARGIN.left + ((station.distance - d0) / (d1 - d0 || 1)) * plotW;
    const chosen = station.profile !== null && options.selected.has(station.profile);
    context.fillStyle = readThemeColor(chosen ? 'primary' : 'muted-foreground');
    context.beginPath();
    context.moveTo(x, MARGIN.top - 2);
    context.lineTo(x - (chosen ? 5 : 3), MARGIN.top - (chosen ? 12 : 8));
    context.lineTo(x + (chosen ? 5 : 3), MARGIN.top - (chosen ? 12 : 8));
    context.fill();
  }
  // Axes.
  context.fillStyle = readThemeColor('muted-foreground');
  context.font = '11px sans-serif';
  context.textAlign = 'center';
  for (const tick of axisTicks(d0, d1))
    context.fillText(
      tick.label,
      MARGIN.left + (plotW * (tick.value - d0)) / (d1 - d0 || 1),
      height - MARGIN.bottom + 14,
    );
  context.textAlign = 'right';
  const v0 = sample.levels[0] ?? 0;
  const v1 = sample.levels[sample.levels.length - 1] ?? 1;
  for (const tick of axisTicks(v0, v1)) {
    const f = (tick.value - v0) / (v1 - v0 || 1);
    const y = options.down ? MARGIN.top + plotH * f : MARGIN.top + plotH - plotH * f;
    context.fillText(tick.label, MARGIN.left - 6, y + 4);
  }
}

/** `clio.section.v1`: a field along a path against a vertical coordinate. */
export function ClioSection(props: SectionProps) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const artifactId = /^artifact:\/\/(artifact_[A-Za-z0-9_-]+)$/u.exec(props.sectionUri)?.[1];
  const [variable, setVariable] = useState(props.variable);
  const [hover, setHover] = useState<{ distance: number; level: number; value: number | null }>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sample = useQuery({
    enabled: Boolean(artifactId),
    queryKey: queryKeys.key('artifact-section', settings.endpoint, artifactId, variable),
    queryFn: ({ signal }) =>
      repository.artifactSectionQuery(artifactId!, { variable, width: 800, height: 400 }, signal),
  });
  const data = sample.data;
  const range = useMemo<[number, number]>(
    () => props.valueRange ?? [data?.min ?? 0, data?.max ?? 1],
    [data?.max, data?.min, props.valueRange],
  );
  const down = props.invertVertical ?? data?.positiveDown ?? true;
  const colormap = props.colormap ?? 'viridis';
  const selected = useMemo(() => {
    const state = parseSelectionState(props.selection);
    return new Set(state ? state.values.map(String) : []);
  }, [props.selection]);
  const size = useCanvasSize(canvasRef, Boolean(data));
  useEffect(() => {
    if (canvasRef.current && data && size.width > 0)
      draw(canvasRef.current, data, {
        map: colormap,
        range,
        interval: props.contourInterval,
        down,
        selected,
      });
  }, [colormap, data, down, props.contourInterval, range, selected, size]);

  const locate = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!data) return undefined;
    const box = event.currentTarget.getBoundingClientRect();
    const plotW = box.width - MARGIN.left - MARGIN.right;
    const plotH = box.height - MARGIN.top - MARGIN.bottom;
    const fx = (event.clientX - box.left - MARGIN.left) / plotW;
    const fyRaw = (event.clientY - box.top - MARGIN.top) / plotH;
    if (fx < 0 || fx > 1 || fyRaw < 0 || fyRaw > 1) return undefined;
    const fy = down ? fyRaw : 1 - fyRaw;
    const column = Math.round(fx * (data.distance.length - 1));
    const row = Math.round(fy * (data.levels.length - 1));
    return {
      distance: data.distance[column]!,
      level: data.levels[row]!,
      value: data.values[row]?.[column] ?? null,
    };
  };
  const click = (event: MouseEvent<HTMLCanvasElement>) => {
    const point = locate(event);
    if (!point || !data) return;
    props.writePointer?.({ distance: point.distance, vertical: point.level, value: point.value });
    if (props.setSelection && props.selectionField && data.stations.length) {
      const nearest = data.stations.reduce((best, station) =>
        Math.abs(station.distance - point.distance) < Math.abs(best.distance - point.distance)
          ? station
          : best,
      );
      if (nearest.profile !== null)
        props.setSelection({
          field: props.selectionField,
          values: [nearest.profile],
          source: props.componentId,
        } as never);
    }
  };

  const heading = props.title ?? data?.variable ?? t`Section`;
  if (!artifactId)
    return (
      <LoadingFailure title={t`The section is not a registered file`} detail={props.sectionUri} />
    );
  return (
    <section className="flex flex-col gap-2 rounded-lg border bg-card p-3" aria-label={heading}>
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-medium">{heading}</h3>
        {(props.variables ?? data?.variables ?? []).length > 1 ? (
          <label className="flex items-center gap-1 text-xs">
            {t`Variable`}
            <select
              className="rounded border bg-background px-1 py-0.5"
              value={variable ?? data?.variable ?? ''}
              onChange={(event) => setVariable(event.target.value)}
            >
              {(props.variables ?? data?.variables ?? []).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </header>
      {sample.isPending ? <LoadingFeedback label={t`Reading section`} variant="skeleton" /> : null}
      {sample.error ? (
        <LoadingFailure
          title={t`The section could not be read`}
          detail={String(sample.error)}
          onRetry={() => void sample.refetch()}
        />
      ) : null}
      {data ? (
        <>
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={t`${ph({ variable: data.variable })} along ${ph({ km: Math.round((data.distance.at(-1) ?? 0) - (data.distance[0] ?? 0)) })} km against ${ph({ vertical: data.vertical })}, ${ph({ stations: data.stations.length })} stations`}
            className="w-full cursor-crosshair"
            style={{ height: props.height ?? 320 }}
            {...DATA_SCALE_EXEMPTION}
            onPointerMove={(event) => setHover(locate(event))}
            onPointerLeave={() => setHover(undefined)}
            onClick={click}
          />
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>{t`Distance (km) along the path; vertical: ${ph({ vertical: data.vertical })} ${ph({ units: data.verticalUnits })}`}</span>
            <span className="flex items-center gap-1" {...DATA_SCALE_EXEMPTION}>
              {range[0].toPrecision(3)}
              <span
                aria-hidden="true"
                className="inline-block h-2 w-24 rounded-sm"
                style={{ background: colormapGradient(colormap) }}
              />
              {range[1].toPrecision(3)} {props.unit ?? data.units}
            </span>
            {hover ? (
              <span role="status" className="tabular-nums text-foreground">
                {t`${ph({ km: hover.distance.toFixed(0) })} km, ${ph({ level: hover.level.toFixed(0) })}: ${ph({ value: hover.value === null ? t`no data` : hover.value.toPrecision(4) })}`}
              </span>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
