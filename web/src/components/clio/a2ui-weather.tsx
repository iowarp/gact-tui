import { createComponentImplementation } from '@a2ui/react/v0_9';
import { CommonSchemas } from '@a2ui/web_core/v0_9';
import { CloudIcon, CloudRainIcon, SunIcon, WindIcon } from 'lucide-react';
import { createElement, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { z } from 'zod';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

const hourSchema = z
  .object({
    time: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/u, 'Forecast time needs an explicit UTC offset or Z'),
    condition: z.string(),
    temperature: z.number(),
    precipitationChance: z.number().min(0).max(100).optional(),
  })
  .strict();
const daySchema = z
  .object({
    date: z.string(),
    condition: z.string(),
    high: z.number(),
    low: z.number(),
    precipitationChance: z.number().min(0).max(100).optional(),
  })
  .strict();
// oxlint-disable-next-line react/only-export-components
export const weatherSchema = z
  .object({
    location: z.string().min(1),
    timeZone: z.string().min(1),
    observedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/u, 'Observation time needs an explicit UTC offset or Z'),
    condition: z.string(),
    temperature: z.number(),
    temperatureUnit: z.enum(['C', 'F']),
    source: z.string().min(1),
    windSpeed: z.number().optional(),
    windUnit: z.string().optional(),
    hourly: z.array(hourSchema).max(240).optional(),
    daily: z.array(daySchema).max(45).optional(),
    accessibility: CommonSchemas.AccessibilityAttributes.optional(),
    weight: z.number().optional(),
  })
  .strict();

type WeatherProps = z.infer<typeof weatherSchema>;

function localTime(value: string, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/u.test(value))
    throw new Error(`Forecast time needs a UTC offset: ${value}`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid forecast time: ${value}`);
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone }).format(date);
}

function localDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new Error(`Invalid local date: ${value}`);
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new Error(`Invalid local date: ${value}`);
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function conditionIcon(condition: string) {
  if (/rain|shower|storm|drizzle|snow/iu.test(condition)) return CloudRainIcon;
  if (/sun|clear/iu.test(condition)) return SunIcon;
  return CloudIcon;
}

function conditionColor(condition: string): string {
  if (/rain|shower|storm|drizzle|snow/iu.test(condition)) return 'text-sky-400';
  if (/sun|clear/iu.test(condition)) return 'text-amber-400';
  return 'text-foreground/80';
}

function WeatherStrip({ children, count, label }: { children: ReactNode; count: number; label: string }) {
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number } | undefined>(undefined);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const update = () => setHasOverflow(node.scrollWidth > node.clientWidth + 1);
    update();
    const resize = new ResizeObserver(update);
    resize.observe(node);
    for (const child of node.children) resize.observe(child);
    const wheel = (event: WheelEvent) => {
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      const canMove = delta < 0 ? node.scrollLeft > 1 : node.scrollLeft + node.clientWidth < node.scrollWidth - 1;
      if (!canMove) return;
      event.preventDefault();
      node.scrollLeft += Math.sign(delta) * Math.min(Math.abs(delta), node.clientWidth * 0.7);
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => {
      resize.disconnect();
      node.removeEventListener('wheel', wheel);
    };
  }, [count]);
  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || !viewport.current) return;
    drag.current = { x: event.clientX, left: viewport.current.scrollLeft };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current && viewport.current) viewport.current.scrollLeft = drag.current.left - (event.clientX - drag.current.x);
  };
  const endDrag = () => {
    drag.current = undefined;
    setDragging(false);
  };
  return (
    <ScrollArea className="min-w-0" scrollHideDelay={600} type="hover" viewportProps={{
      'aria-label': label,
      className: `overscroll-x-contain ${hasOverflow ? dragging ? 'cursor-grabbing select-none' : 'cursor-grab select-none' : ''}`,
      onPointerCancel: endDrag,
      onPointerDown: startDrag,
      onPointerMove: moveDrag,
      onPointerUp: endDrag,
      ref: viewport,
      role: 'group',
    }}>
      <div className="flex w-max min-w-full gap-2 pb-1">{children}</div>
      <ScrollBar
        aria-label={`Scroll ${label.toLowerCase()}`}
        className="border-0 bg-transparent p-0 [&_[data-slot=scroll-area-thumb]]:bg-foreground/35 hover:[&_[data-slot=scroll-area-thumb]]:bg-foreground/55"
        orientation="horizontal"
        style={{ height: 5 }}
      />
    </ScrollArea>
  );
}

/** Render supplied weather data with explicit units, source, and local time. */
export function ClioWeather(props: WeatherProps) {
  let observed: string;
  let hours: { day: string; time: string }[];
  let days: string[];
  try {
    observed = localTime(props.observedAt, props.timeZone, {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
    hours = (props.hourly ?? []).map((hour) => ({
      day: localTime(hour.time, props.timeZone, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
      time: localTime(hour.time, props.timeZone, { hour: 'numeric' }),
    }));
    days = (props.daily ?? []).map((day) => localDate(day.date));
  } catch (error) {
    return (
      <p
        className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
        role="alert"
      >
        Weather unavailable: {error instanceof Error ? error.message : String(error)}
      </p>
    );
  }
  const Icon = conditionIcon(props.condition);
  const unit = `°${props.temperatureUnit}`;
  const sourceLink = /^(.*?)\s*\((https:\/\/[^)\s]+)\)(.*)$/u.exec(props.source);
  return (
    <section
      aria-label={`Weather for ${props.location}`}
      className="overflow-hidden rounded-xl border border-border/70 bg-linear-to-br from-sky-500/10 via-card to-card"
      data-slot="a2ui-weather"
    >
      <div className="flex flex-wrap items-end justify-between gap-5 px-5 pb-5 pt-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {props.location}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-5xl font-light tabular-nums tracking-tight">
              {Math.round(props.temperature)}
              {unit}
            </span>
            {createElement(Icon, { 'aria-hidden': true, className: `size-8 shrink-0 ${conditionColor(props.condition)}` })}
          </div>
          <p className="mt-1 text-sm">{props.condition}</p>
        </div>
        <div className="min-w-0 basis-full text-left text-xs text-muted-foreground sm:basis-auto sm:text-right">
          <p>As of {observed}</p>
          {props.windSpeed !== undefined ? (
            <p className="mt-1 flex items-center justify-start gap-1 sm:justify-end">
              <WindIcon aria-hidden="true" className="size-3.5" />
              Wind {props.windSpeed} {props.windUnit ?? ''}
            </p>
          ) : null}
          <p className="mt-1">Source: {sourceLink ? <>
            <a className="underline decoration-foreground/25 underline-offset-2 hover:text-foreground hover:decoration-current" href={sourceLink[2]} rel="noopener noreferrer" target="_blank">{sourceLink[1]?.trim() || sourceLink[2]}</a>
            {sourceLink[3]}
          </> : props.source}</p>
        </div>
      </div>
      {props.hourly?.length ? (
        <div className="border-t border-border/60 px-4 py-3">
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">Hourly</h3>
          <WeatherStrip count={props.hourly.length} label="Hourly forecast">
            {props.hourly.map((hour, index) => {
              const { day, time } = hours[index]!;
              const HourIcon = conditionIcon(hour.condition);
              return (
                <div
                  className="min-w-23 flex-none rounded-md px-2 py-1.5 text-center text-xs"
                  key={`${hour.time}-${index}`}
                  title={hour.condition}
                >
                  <p className="whitespace-nowrap text-[11px] text-muted-foreground">{day}</p>
                  <p className="mt-0.5 font-medium tabular-nums">{time}</p>
                  <HourIcon aria-hidden="true" className={`mx-auto my-2 size-5 shrink-0 ${conditionColor(hour.condition)}`} />
                  <p className="font-medium tabular-nums">
                    {Math.round(hour.temperature)}
                    {unit}
                  </p>
                  {hour.precipitationChance !== undefined ? (
                    <p className="mt-1 text-sky-600 dark:text-sky-400">
                      {Math.round(hour.precipitationChance)}% rain
                    </p>
                  ) : null}
                </div>
              );
            })}
          </WeatherStrip>
        </div>
      ) : null}
      {props.daily?.length ? (
        <div className="border-t border-border/60 px-4 py-3">
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">Daily</h3>
          <WeatherStrip count={props.daily.length} label="Daily forecast">
            {props.daily.map((day, index) => {
              const date = days[index]!;
              const DayIcon = conditionIcon(day.condition);
              return (
                <div
                  className="w-38 min-w-0 flex-none px-2 py-1 text-xs"
                  key={`${day.date}-${index}`}
                  title={day.condition}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <DayIcon
                      aria-hidden="true"
                      className={`size-6 shrink-0 stroke-[2.25] ${conditionColor(day.condition)}`}
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{date}</p>
                      <p className="truncate text-muted-foreground">{day.condition}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between gap-1 tabular-nums">
                    <span className="font-medium">
                      {Math.round(day.high)}° <span className="text-muted-foreground">{Math.round(day.low)}°</span>
                    </span>
                    {day.precipitationChance !== undefined ? (
                      <span className="text-sky-600 dark:text-sky-400">
                        {Math.round(day.precipitationChance)}%
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </WeatherStrip>
        </div>
      ) : null}
    </section>
  );
}

// oxlint-disable-next-line react/only-export-components
export const ClioWeatherCatalogComponent = createComponentImplementation(
  { name: 'clio.weather.v1', schema: weatherSchema },
  ({ props }) => <ClioWeather {...props} />,
);
