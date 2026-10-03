import { useQuery } from '@tanstack/react-query';
import { MinusIcon, ScanIcon, ZoomInIcon } from 'lucide-react';
import { AddIcon, RetryIcon } from '@/lib/icon-vocabulary';
import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import type { ArtifactRasterQueryResult } from '@clio/core/v3';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { queryKeys } from '@/lib/query-keys';
import { buildZoneReference, type DataZoneReference } from './data-zone-reference';
import { downloadBlob, filenameStemFromTitle } from './surface-export';
import { SurfaceFullScreenHost, useSurfaceFullScreen } from './surface-full-screen';
import { SurfaceToolbar, type SurfaceCapabilities } from './surface-toolbar';

type Extent = [number, number, number, number];
type Box = { x0: number; y0: number; x1: number; y1: number };
type Colormap = 'viridis' | 'magma' | 'plasma' | 'cividis' | 'turbo' | 'grayscale';

const STOPS: Record<Colormap, readonly [string, string, string, string, string]> = {
  viridis: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'],
  magma: ['#000004', '#51127c', '#b73779', '#fc8961', '#fcfdbf'],
  plasma: ['#0d0887', '#7e03a8', '#cb4679', '#f89441', '#f0f921'],
  cividis: ['#00204c', '#424e6c', '#7c7b78', '#bba774', '#ffea46'],
  turbo: ['#30123b', '#3e9eca', '#9cd93b', '#f99b21', '#7a0403'],
  grayscale: ['#161616', '#4d4d4d', '#858585', '#bdbdbd', '#f5f5f5'],
};

function colorAt(map: Colormap, fraction: number): [number, number, number] {
  const scaled = Math.max(0, Math.min(0.9999, fraction)) * 4;
  const index = Math.floor(scaled);
  const position = scaled - index;
  const from = STOPS[map][index]!;
  const to = STOPS[map][index + 1]!;
  return [1, 3, 5].map((offset) => {
    const a = Number.parseInt(from.slice(offset, offset + 2), 16);
    const b = Number.parseInt(to.slice(offset, offset + 2), 16);
    return Math.round(a + (b - a) * position);
  }) as [number, number, number];
}

function drawRaster(canvas: HTMLCanvasElement, sample: ArtifactRasterQueryResult, map: Colormap): void {
  canvas.width = sample.width;
  canvas.height = sample.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return;
  const pixels = context.createImageData(sample.width, sample.height);
  const span = Math.max((sample.max ?? 1) - (sample.min ?? 0), Number.EPSILON);
  sample.values.forEach((value, index) => {
    const offset = index * 4;
    if (value === null) {
      pixels.data[offset + 3] = 0;
      return;
    }
    const [r, g, b] = colorAt(map, (value - (sample.min ?? 0)) / span);
    pixels.data[offset] = r;
    pixels.data[offset + 1] = g;
    pixels.data[offset + 2] = b;
    pixels.data[offset + 3] = 255;
  });
  context.putImageData(pixels, 0, 0);
}

function rangeForBox(extent: Extent, box: Box): Extent {
  const [left, top, right, bottom] = extent;
  return [
    left + Math.min(box.x0, box.x1) * (right - left),
    top + Math.min(box.y0, box.y1) * (bottom - top),
    left + Math.max(box.x0, box.x1) * (right - left),
    top + Math.max(box.y0, box.y1) * (bottom - top),
  ];
}

/** Interactive registered-grid viewer with a bounded server sample per visible extent. */
export function ClioRasterViewport({
  rasterUri, componentId, title, variable, band = 1, colormap = 'viridis', unit = '', weight,
}: {
  rasterUri: string; componentId?: string; title?: string; variable?: string; band?: number; colormap?: Colormap; unit?: string; weight?: number;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const artifactId = /^artifact:\/\/(artifact_[A-Za-z0-9_-]+)$/u.exec(rasterUri)?.[1];
  const heading = title || variable || 'Raster';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; extent: Extent } | null>(null);
  const [fullscreen, setFullscreen] = useSurfaceFullScreen();
  const [extent, setExtent] = useState<Extent>();
  const [boxMode, setBoxMode] = useState(false);
  const [selectedExtent, setSelectedExtent] = useState<Extent>();
  const [draft, setDraft] = useState<Box>();
  const [hover, setHover] = useState<{ x: number; y: number; value: number | null }>();
  const sample = useQuery({
    enabled: Boolean(artifactId),
    queryKey: queryKeys.key('artifact-raster', settings.endpoint, artifactId, variable, band, extent?.join(','), fullscreen),
    queryFn: ({ signal }) => repository.artifactRasterQuery(artifactId!, {
      width: fullscreen ? 768 : 512,
      height: fullscreen ? 768 : 512,
      ...(extent ? { extent } : {}), variable, band,
    }, signal),
    staleTime: 60_000,
  });
  const data = sample.data;
  useEffect(() => {
    if (data && canvasRef.current) drawRaster(canvasRef.current, data, colormap);
  }, [data, colormap, fullscreen]);
  const activeExtent = (data?.extent ?? extent) as Extent | undefined;
  const point = (event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!activeExtent) return;
    const start = point(event);
    dragRef.current = { ...start, extent: activeExtent };
    if (boxMode) setDraft({ x0: start.x, y0: start.y, x1: start.x, y1: start.y });
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = point(event);
    if (data) {
      const ix = Math.min(data.width - 1, Math.floor(current.x * data.width));
      const iy = Math.min(data.height - 1, Math.floor(current.y * data.height));
      setHover({ x: current.x, y: current.y, value: data.values[iy * data.width + ix] ?? null });
    }
    const drag = dragRef.current;
    if (!drag) return;
    if (boxMode) {
      setDraft({ x0: drag.x, y0: drag.y, x1: current.x, y1: current.y });
    } else {
      setDraft(undefined);
      // Panning commits on release, so dragging does not issue one query per frame.
    }
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const current = point(event);
    if (Math.abs(current.x - drag.x) + Math.abs(current.y - drag.y) < 0.006) return;
    if (boxMode) {
      setSelectedExtent(rangeForBox(drag.extent, { x0: drag.x, y0: drag.y, x1: current.x, y1: current.y }));
      setDraft(undefined);
    } else {
      const [left, top, right, bottom] = drag.extent;
      setExtent([
        left - (current.x - drag.x) * (right - left),
        top - (current.y - drag.y) * (bottom - top),
        right - (current.x - drag.x) * (right - left),
        bottom - (current.y - drag.y) * (bottom - top),
      ]);
    }
  };
  const zoom = (factor: number) => {
    if (!activeExtent) return;
    const [left, top, right, bottom] = activeExtent;
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;
    setExtent([centerX + (left - centerX) * factor, centerY + (top - centerY) * factor,
      centerX + (right - centerX) * factor, centerY + (bottom - centerY) * factor]);
    setSelectedExtent(undefined);
  };
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    zoom(event.deltaY > 0 ? 1.25 : 0.8);
  };
  const selectedBox = selectedExtent && activeExtent ? {
    x0: (selectedExtent[0] - activeExtent[0]) / (activeExtent[2] - activeExtent[0]),
    y0: (selectedExtent[1] - activeExtent[1]) / (activeExtent[3] - activeExtent[1]),
    x1: (selectedExtent[2] - activeExtent[0]) / (activeExtent[2] - activeExtent[0]),
    y1: (selectedExtent[3] - activeExtent[1]) / (activeExtent[3] - activeExtent[1]),
  } : undefined;
  const reference = (): DataZoneReference => buildZoneReference({
    componentLabel: heading,
    datasetLabel: artifactId ?? rasterUri,
    filters: [], previewColumns: [], previewRows: [],
    query: { rasterUri, variable, band, extent: selectedExtent ?? activeExtent, selection: selectedExtent ? 'region' : 'visible view' },
    zoneDescription: selectedExtent ? 'the selected rectangular region' : 'the current visible extent',
  });
  const csv = () => {
    if (!data) return;
    const lines = ['x,y,value'];
    for (let y = 0; y < data.height; y += 1) for (let x = 0; x < data.width; x += 1) {
      const value = data.values[y * data.width + x];
      const worldX = data.extent[0] + (x + 0.5) / data.width * (data.extent[2] - data.extent[0]);
      const worldY = data.extent[1] + (y + 0.5) / data.height * (data.extent[3] - data.extent[1]);
      if (selectedExtent && (worldX < selectedExtent[0] || worldX > selectedExtent[2]
        || (worldY - selectedExtent[1]) * (selectedExtent[3] - selectedExtent[1]) < 0
        || (worldY - selectedExtent[3]) * (selectedExtent[3] - selectedExtent[1]) > 0)) continue;
      if (value !== null) lines.push(`${worldX},${worldY},${value}`);
    }
    downloadBlob(new Blob([lines.join('\n')], { type: 'text/csv' }), `${filenameStemFromTitle(heading)}-${selectedExtent ? 'selected-' : ''}sampled.csv`);
  };
  const capabilities: SurfaceCapabilities = {
    captureComponentId: componentId,
    buildReference: data ? reference : undefined,
    onReferenced: () => setBoxMode(false),
    fullScreen: { isOpen: fullscreen, onToggle: () => setFullscreen(!fullscreen) },
    exportFormats: [
      { id: 'png', label: 'PNG image', disabled: !data, run: () => canvasRef.current?.toBlob((blob) => {
        if (blob) downloadBlob(blob, `${filenameStemFromTitle(heading)}.png`);
      }) },
      { id: 'csv', label: selectedExtent ? 'CSV sampled selection' : 'CSV sampled view', disabled: !data, run: csv },
    ],
  };
  const selection = draft ?? selectedBox;
  const overlay = selection ? {
    left: `${Math.min(selection.x0, selection.x1) * 100}%`,
    top: `${Math.min(selection.y0, selection.y1) * 100}%`,
    width: `${Math.abs(selection.x1 - selection.x0) * 100}%`,
    height: `${Math.abs(selection.y1 - selection.y0) * 100}%`,
  } : undefined;
  const legend = useMemo(() => `linear-gradient(to right, ${STOPS[colormap].join(', ')})`, [colormap]);
  const controls = (insideDialog: boolean) => <>
    <Button aria-label="Box select" aria-pressed={boxMode} className={`size-7 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100 ${boxMode ? 'opacity-100' : ''}`} onClick={() => setBoxMode(!boxMode)} size="icon" title="Draw a box to select a region" variant={boxMode ? 'secondary' : 'ghost'}><ScanIcon className="size-3.5" /></Button>
    {selectedExtent ? <Button aria-label="Zoom to selection" className="size-7" onClick={() => { setExtent(selectedExtent); setSelectedExtent(undefined); setBoxMode(false); }} size="icon" title="Zoom to selection" variant="ghost"><ZoomInIcon className="size-3.5" /></Button> : null}
    {extent ? <Button aria-label="Reset zoom" className="size-7" onClick={() => { setExtent(undefined); setSelectedExtent(undefined); }} size="icon" title="Reset zoom" variant="ghost"><RetryIcon className="size-3.5" /></Button> : null}
    <SurfaceToolbar capabilities={insideDialog ? { ...capabilities, fullScreen: undefined } : capabilities} floating={false} />
  </>;
  return <section className="group min-w-0" data-slot="a2ui-raster-viewport" style={weight ? { flex: weight } : undefined}>
    <div className="mb-2 flex items-center gap-2">
      <h3 className="min-w-0 flex-1 truncate text-sm font-medium">{heading}</h3>
      {controls(false)}
    </div>
    <SurfaceFullScreenHost fullscreen={fullscreen} headerExtra={controls(true)} onOpenChange={setFullscreen} title={heading}>
      <div className="relative" data-a2ui-component-id={componentId} data-slot="a2ui-raster-surface" ref={surfaceRef}>
        {sample.isError ? <p className="p-4 text-sm text-destructive">Raster unavailable: {sample.error instanceof Error ? sample.error.message : String(sample.error)}</p> : null}
        <div className={fullscreen ? 'relative h-[calc(100dvh-8rem)] min-h-64 cursor-grab overflow-hidden bg-muted/30' : 'relative h-80 min-h-64 cursor-grab overflow-hidden bg-muted/30'}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={() => setHover(undefined)} onWheel={onWheel}
          style={{ cursor: boxMode ? 'crosshair' : undefined }}>
          <canvas aria-label={`${heading} raster image`} className="size-full" ref={canvasRef} role="img" style={{ imageRendering: 'pixelated' }} />
          {overlay ? <div className="pointer-events-none absolute border-2 border-cyan-400 bg-cyan-400/10" style={overlay} /> : null}
          {sample.isFetching ? <span className="absolute left-2 top-2 rounded bg-background/80 px-2 py-1 text-xs">Sampling…</span> : null}
          {hover && data ? <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-background/85 px-2 py-1 font-mono text-xs">{hover.value === null ? 'No data' : `${hover.value.toPrecision(5)} ${unit}`}</span> : null}
          <div className="absolute right-2 top-2 flex flex-col rounded bg-background/80">
            <Button aria-label="Zoom in" className="size-7" onClick={() => zoom(0.8)} size="icon" variant="ghost"><AddIcon className="size-4" /></Button>
            <Button aria-label="Zoom out" className="size-7" onClick={() => zoom(1.25)} size="icon" variant="ghost"><MinusIcon className="size-4" /></Button>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{data?.min?.toPrecision(4) ?? '—'}</span><span aria-label={`${colormap} colour scale`} className="h-2 flex-1 rounded" style={{ background: legend }} /><span>{data?.max?.toPrecision(4) ?? '—'} {unit}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{selectedExtent ? 'Region selected · Zoom to selection or Reference this' : 'Drag to pan · Ctrl + wheel to zoom'}</p>
      </div>
    </SurfaceFullScreenHost>
  </section>;
}
