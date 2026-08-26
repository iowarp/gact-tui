import {
  ChartNoAxesCombinedIcon,
  FocusIcon,
  Maximize2Icon,
  XIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Button } from '@/components/ui/button';

type PlotValue = string | number | null;
export type PlotRow = Record<string, PlotValue>;

const MAX_VISIBLE_ROWS = 1_000;
const COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

function numeric(value: PlotValue | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function concise(value: number): string {
  const absolute = Math.abs(value);
  if ((absolute > 0 && absolute < 0.01) || absolute >= 10_000) return value.toExponential(2);
  return Number(value.toPrecision(4)).toString();
}

function isEpochMilliseconds(values: number[]): boolean {
  return (
    values.length > 0 &&
    values.every((value) => value >= 100_000_000_000 && value < 10_000_000_000_000)
  );
}

function formatUtcTimestamp(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}

export function ClioTimeSeriesPlot({
  rows,
  xKey,
  yKeys,
  title,
  sourceRows,
}: {
  rows: PlotRow[];
  xKey: string;
  yKeys: string[];
  title?: string;
  sourceRows?: number;
}) {
  const [selectedRange, setSelectedRange] = useState<[number, number]>();
  const [selection, setSelection] = useState<[number, number]>();
  const [isSelecting, setIsSelecting] = useState(false);
  const selectingRef = useRef(false);
  const draftSelectionRef = useRef<[number, number]>();
  const dragStartXRef = useRef<number>();
  const pendingDragXRef = useRef<number>();
  const selectionFrameRef = useRef<number>();
  const selectionOverlayRef = useRef<HTMLDivElement>(null);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(() => new Set());
  useEffect(
    () => () => {
      if (selectionFrameRef.current !== undefined) {
        cancelAnimationFrame(selectionFrameRef.current);
      }
    },
    [],
  );
  const visibleRows = rows.slice(0, MAX_VISIBLE_ROWS).map((row) => ({
    ...row,
    ...Object.fromEntries(yKeys.map((key) => [key, numeric(row[key])])),
  }));
  const values = visibleRows.flatMap((row) =>
    yKeys.map((key) => numeric(row[key])).filter((value): value is number => value !== undefined),
  );

  if (visibleRows.length === 0 || yKeys.length === 0 || values.length === 0) {
    return (
      <Frame spacing="sm">
        <FramePanel className="text-sm text-muted-foreground">
          Plot unavailable: no numeric series were provided.
        </FramePanel>
      </Frame>
    );
  }

  const chartConfig = Object.fromEntries(
    yKeys.map((key, index) => [
      key,
      { label: key.replaceAll('_', ' '), color: COLORS[index % COLORS.length] },
    ]),
  ) satisfies ChartConfig;
  const numericX = visibleRows.every((row) => numeric(row[xKey]) !== undefined);
  const numericXValues = numericX
    ? visibleRows
        .map((row) => numeric(row[xKey]))
        .filter((value): value is number => value !== undefined)
    : [];
  const temporalX = isEpochMilliseconds(numericXValues);
  const chartTitle = title || 'Time series';
  const maximumIndex = visibleRows.length - 1;
  const rangeStart = Math.min(selectedRange?.[0] ?? 0, maximumIndex);
  const rangeEnd = Math.max(rangeStart, Math.min(selectedRange?.[1] ?? maximumIndex, maximumIndex));
  const displayedRows = visibleRows.slice(rangeStart, rangeEnd + 1);
  const sourceCount = Math.max(sourceRows ?? rows.length, rows.length);

  function toggleSeries(key: string): void {
    setHiddenSeries((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else if (yKeys.length - next.size > 1) {
        next.add(key);
      }
      return next;
    });
  }

  function rowIndexForLabel(label: unknown): number | undefined {
    const localIndex = displayedRows.findIndex((row) => String(row[xKey]) === String(label));
    return localIndex < 0 ? undefined : rangeStart + localIndex;
  }

  function paintSelection(): void {
    selectionFrameRef.current = undefined;
    const overlay = selectionOverlayRef.current;
    const start = dragStartXRef.current;
    const end = pendingDragXRef.current;
    if (!overlay || start === undefined || end === undefined) return;
    overlay.style.display = 'block';
    overlay.style.left = `${Math.min(start, end)}px`;
    overlay.style.width = `${Math.max(2, Math.abs(end - start))}px`;
  }

  function scheduleSelectionPaint(x: number): void {
    pendingDragXRef.current = x;
    if (selectionFrameRef.current !== undefined) return;
    selectionFrameRef.current = requestAnimationFrame(paintSelection);
  }

  function hideSelection(): void {
    if (selectionFrameRef.current !== undefined) {
      cancelAnimationFrame(selectionFrameRef.current);
      selectionFrameRef.current = undefined;
    }
    const overlay = selectionOverlayRef.current;
    if (overlay) overlay.style.display = 'none';
    dragStartXRef.current = undefined;
    pendingDragXRef.current = undefined;
    draftSelectionRef.current = undefined;
  }

  function beginSelection(label: unknown, x: number | undefined): void {
    const index = rowIndexForLabel(label);
    if (index === undefined || x === undefined) return;
    setSelection(undefined);
    draftSelectionRef.current = [index, index];
    dragStartXRef.current = x;
    selectingRef.current = true;
    setIsSelecting(true);
    scheduleSelectionPaint(x);
  }

  function extendSelection(label: unknown, x: number | undefined): void {
    if (!selectingRef.current) return;
    const index = rowIndexForLabel(label);
    const current = draftSelectionRef.current;
    if (index === undefined || x === undefined || !current) return;
    draftSelectionRef.current = [current[0], index];
    scheduleSelectionPaint(x);
  }

  function endSelection(): void {
    if (!selectingRef.current) return;
    if (selectionFrameRef.current !== undefined) {
      cancelAnimationFrame(selectionFrameRef.current);
      selectionFrameRef.current = undefined;
      paintSelection();
    }
    selectingRef.current = false;
    setIsSelecting(false);
    setSelection(draftSelectionRef.current);
  }

  function focusSelection(): void {
    if (!selection) return;
    const start = Math.min(...selection);
    const end = Math.max(...selection);
    if (end - start < 2) return;
    setSelectedRange([start, end]);
    setSelection(undefined);
    selectingRef.current = false;
    setIsSelecting(false);
    hideSelection();
  }

  function resetWindow(): void {
    setSelectedRange(undefined);
    setSelection(undefined);
    selectingRef.current = false;
    setIsSelecting(false);
    hideSelection();
  }

  function clearSelection(): void {
    setSelection(undefined);
    selectingRef.current = false;
    setIsSelecting(false);
    hideSelection();
  }

  const selectionStart = selection ? Math.min(...selection) : undefined;
  const selectionEnd = selection ? Math.max(...selection) : undefined;
  const selectionReady =
    selectionStart !== undefined && selectionEnd !== undefined && selectionEnd - selectionStart >= 2;
  const selectionLabel =
    selectionStart !== undefined && selectionEnd !== undefined
      ? `Selected rows ${selectionStart + 1}–${selectionEnd + 1}`
      : undefined;
  return (
    <Frame dense spacing="sm">
      <FrameHeader className="flex-row items-center gap-2">
        <ChartNoAxesCombinedIcon aria-hidden="true" className="size-4 text-primary" />
        <div className="min-w-0">
          <FrameTitle>{chartTitle}</FrameTitle>
          <FrameDescription>
            {sourceCount > visibleRows.length
              ? `${visibleRows.length.toLocaleString()} evenly sampled rows from ${sourceCount.toLocaleString()} total`
              : selectedRange
                ? `${displayedRows.length.toLocaleString()} of ${visibleRows.length.toLocaleString()} rows visible`
                : `${visibleRows.length.toLocaleString()} rows`}
          </FrameDescription>
        </div>
      </FrameHeader>
      <FramePanel className="p-3">
        <div
          aria-label={`${chartTitle} plot. Drag across the chart to select a range.`}
          className="relative cursor-crosshair select-none"
          role="img"
        >
          <ChartContainer
            className="min-h-64 w-full"
            config={chartConfig}
            initialDimension={{ width: 720, height: 260 }}
          >
            <LineChart
              accessibilityLayer
              data={displayedRows}
              margin={{ left: 6, right: 18, top: 8 }}
              onMouseDown={(state) => beginSelection(state?.activeLabel, state?.activeCoordinate?.x)}
              onMouseLeave={endSelection}
              onMouseMove={(state) => extendSelection(state?.activeLabel, state?.activeCoordinate?.x)}
              onMouseUp={endSelection}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                axisLine={false}
                dataKey={xKey}
                domain={numericX ? ['dataMin', 'dataMax'] : undefined}
                minTickGap={28}
                tickFormatter={(value: number | string) =>
                  temporalX && typeof value === 'number' ? formatUtcTimestamp(value) : String(value)
                }
                tickLine={false}
                type={numericX ? 'number' : 'category'}
              />
              <YAxis
                axisLine={false}
                tickFormatter={(value: number) => concise(value)}
                tickLine={false}
                width={54}
              />
              <ChartTooltip
                active={isSelecting ? false : undefined}
                content={
                  <ChartTooltipContent
                    indicator="line"
                    labelFormatter={(value) => {
                      const numericValue = numeric(value as PlotValue);
                      return temporalX && numericValue !== undefined
                        ? `${formatUtcTimestamp(numericValue)} UTC`
                        : String(value);
                    }}
                  />
                }
              />
              {yKeys.map((key, index) => (
                <Line
                  activeDot={isSelecting ? false : { r: 4 }}
                  dataKey={key}
                  dot={false}
                  key={key}
                  name={key}
                  stroke={COLORS[index % COLORS.length]}
                  strokeWidth={2}
                  type="linear"
                  hide={hiddenSeries.has(key)}
                />
              ))}
            </LineChart>
          </ChartContainer>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-10 top-2 z-10 hidden border-x border-primary/80 bg-primary/15"
            ref={selectionOverlayRef}
          />
        </div>
        <div aria-label="Visible series" className="mt-2 flex flex-wrap gap-1.5" role="group">
          {yKeys.map((key, index) => {
            const hidden = hiddenSeries.has(key);
            return (
              <Button
                aria-pressed={!hidden}
                className="h-7 gap-1.5 px-2"
                key={key}
                onClick={() => toggleSeries(key)}
                size="xs"
                variant={hidden ? 'ghost' : 'secondary'}
              >
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                {key.replaceAll('_', ' ')}
              </Button>
            );
          })}
        </div>
        {visibleRows.length > 20 ? (
          <div className="mt-3 grid gap-2 border-t pt-3">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted-foreground">
                {selectionReady
                  ? selectionLabel
                  : selectedRange
                    ? `Showing rows ${rangeStart + 1}–${rangeEnd + 1}`
                    : 'Drag across the chart to select a range'}
              </span>
              <div aria-label="Chart selection" className="flex items-center gap-0.5" role="group">
                {selection ? (
                  <Button
                    aria-label="Clear chart selection"
                    onClick={clearSelection}
                    size="icon-xs"
                    title="Clear selection"
                    variant="ghost"
                  >
                    <XIcon aria-hidden="true" />
                  </Button>
                ) : null}
                <Button
                  aria-label="Focus chart selection"
                  disabled={!selectionReady}
                  onClick={focusSelection}
                  size="icon-xs"
                  title="Focus selection"
                  variant="ghost"
                >
                  <FocusIcon aria-hidden="true" />
                </Button>
                {selectedRange ? (
                  <Button
                    aria-label="Show full chart range"
                    onClick={resetWindow}
                    size="icon-xs"
                    title="Show full range"
                    variant="ghost"
                  >
                    <Maximize2Icon aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </FramePanel>
      {rows.length > visibleRows.length ? (
        <p className="px-3 pb-2 text-xs text-muted-foreground">
          Showing the first {visibleRows.length.toLocaleString()} of {rows.length.toLocaleString()}{' '}
          rows.
        </p>
      ) : null}
    </Frame>
  );
}
