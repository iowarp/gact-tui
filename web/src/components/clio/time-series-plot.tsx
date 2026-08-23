import { ChartNoAxesCombinedIcon, RotateCcwIcon } from 'lucide-react';
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
  ChartLegend,
  ChartLegendContent,
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

export function ClioTimeSeriesPlot({
  rows,
  xKey,
  yKeys,
  title,
}: {
  rows: PlotRow[];
  xKey: string;
  yKeys: string[];
  title?: string;
}) {
  const [selectedRange, setSelectedRange] = useState<[number, number]>();
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
  const chartTitle = title || 'Time series';
  const maximumIndex = visibleRows.length - 1;
  const rangeStart = Math.min(selectedRange?.[0] ?? 0, maximumIndex);
  const rangeEnd = Math.max(rangeStart, Math.min(selectedRange?.[1] ?? maximumIndex, maximumIndex));
  const displayedRows = visibleRows.slice(rangeStart, rangeEnd + 1);

  return (
    <Frame dense spacing="sm">
      <FrameHeader className="flex-row items-center gap-2">
        <ChartNoAxesCombinedIcon aria-hidden="true" className="size-4 text-primary" />
        <div className="min-w-0">
          <FrameTitle>{chartTitle}</FrameTitle>
          <FrameDescription>
            {selectedRange
              ? `${displayedRows.length.toLocaleString()} of ${visibleRows.length.toLocaleString()} observations visible`
              : `${visibleRows.length.toLocaleString()} observations`}
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
                minTickGap={28}
                tickLine={false}
                type={numericX ? 'number' : 'category'}
              />
              <YAxis
                axisLine={false}
                tickFormatter={(value: number) => concise(value)}
                tickLine={false}
                width={54}
              />
              <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
              <ChartLegend content={<ChartLegendContent />} />
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
                />
              ))}
            </LineChart>
          </ChartContainer>
        </div>
        {visibleRows.length > 20 ? (
          <div className="mt-3 grid gap-2 border-t pt-3">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted-foreground">
                Visible rows {rangeStart + 1}–{rangeEnd + 1}
              </span>
              <Button
                disabled={!selectedRange}
                onClick={() => setSelectedRange(undefined)}
                size="xs"
                variant="ghost"
              >
                <RotateCcwIcon aria-hidden="true" /> Reset window
              </Button>
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
          observations.
        </p>
      ) : null}
    </Frame>
  );
}
