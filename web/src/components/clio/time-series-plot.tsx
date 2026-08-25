import {
  ChartNoAxesCombinedIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  RotateCcwIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react';
import { useState } from 'react';
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
import { Slider } from '@/components/ui/slider';

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
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(() => new Set());
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

  function setWindow(start: number, end: number): void {
    const width = Math.max(1, Math.min(end - start, maximumIndex));
    const boundedStart = Math.max(0, Math.min(start, maximumIndex - width));
    setSelectedRange([boundedStart, boundedStart + width]);
  }

  function zoom(factor: number): void {
    const width = rangeEnd - rangeStart;
    const nextWidth = Math.max(5, Math.min(maximumIndex, Math.round(width * factor)));
    const center = (rangeStart + rangeEnd) / 2;
    setWindow(Math.round(center - nextWidth / 2), Math.round(center + nextWidth / 2));
  }

  function pan(direction: -1 | 1): void {
    const width = rangeEnd - rangeStart;
    const distance = Math.max(1, Math.round(width * 0.25)) * direction;
    setWindow(rangeStart + distance, rangeEnd + distance);
  }

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
        <div aria-label={`${chartTitle} plot`} role="img">
          <ChartContainer
            className="min-h-64 w-full"
            config={chartConfig}
            initialDimension={{ width: 720, height: 260 }}
          >
            <LineChart
              accessibilityLayer
              data={displayedRows}
              margin={{ left: 6, right: 18, top: 8 }}
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
                  activeDot={{ r: 4 }}
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
                Visible rows {rangeStart + 1}–{rangeEnd + 1}
              </span>
              <div aria-label="Chart navigation" className="flex items-center gap-0.5" role="group">
                <Button
                  aria-label="Pan chart left"
                  disabled={!selectedRange || rangeStart === 0}
                  onClick={() => pan(-1)}
                  size="icon-xs"
                  title="Pan left"
                  variant="ghost"
                >
                  <ChevronLeftIcon aria-hidden="true" />
                </Button>
                <Button
                  aria-label="Pan chart right"
                  disabled={!selectedRange || rangeEnd === maximumIndex}
                  onClick={() => pan(1)}
                  size="icon-xs"
                  title="Pan right"
                  variant="ghost"
                >
                  <ChevronRightIcon aria-hidden="true" />
                </Button>
                <Button
                  aria-label="Zoom chart in"
                  onClick={() => zoom(0.5)}
                  size="icon-xs"
                  title="Zoom in"
                  variant="ghost"
                >
                  <ZoomInIcon aria-hidden="true" />
                </Button>
                <Button
                  aria-label="Zoom chart out"
                  disabled={!selectedRange}
                  onClick={() => zoom(2)}
                  size="icon-xs"
                  title="Zoom out"
                  variant="ghost"
                >
                  <ZoomOutIcon aria-hidden="true" />
                </Button>
                <Button
                  aria-label="Reset chart window"
                  disabled={!selectedRange}
                  onClick={() => setSelectedRange(undefined)}
                  size="icon-xs"
                  title="Reset window"
                  variant="ghost"
                >
                  <RotateCcwIcon aria-hidden="true" />
                </Button>
              </div>
            </div>
            <Slider
              aria-label="Visible observation window"
              max={maximumIndex}
              min={0}
              minStepsBetweenThumbs={1}
              onValueChange={(value) => setSelectedRange([value[0] ?? 0, value[1] ?? maximumIndex])}
              value={[rangeStart, rangeEnd]}
            />
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
