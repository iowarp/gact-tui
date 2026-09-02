import { createComponentImplementation } from '@a2ui/react/v0_9';
import { CommonSchemas } from '@a2ui/web_core/v0_9';
import { A2UI_TIME_SERIES_ROWS_MAX, A2UI_TIME_SERIES_Y_KEYS_MAX } from '@clio/core/v3';
import { createElement, lazy, Suspense } from 'react';
import { z } from 'zod';
import type { PlotRow } from './time-series-plot';

const LazyTimeSeries = lazy(() =>
  import('./a2ui-time-series').then((module) => ({ default: module.ClioA2UITimeSeries })),
);
const plotValue = z.union([z.string(), z.number(), z.null()]);
const schema = z
  .object({
    series: z.array(z.record(plotValue)).max(A2UI_TIME_SERIES_ROWS_MAX).optional(),
    dataUri: z.string().optional(),
    xKey: z.string(),
    yKeys: z.array(z.string()).min(1).max(A2UI_TIME_SERIES_Y_KEYS_MAX),
    title: CommonSchemas.DynamicString.optional(),
    accessibility: CommonSchemas.AccessibilityAttributes.optional(),
    weight: z.number().optional(),
  })
  .strict()
  .refine((value) => Boolean(value.series) !== Boolean(value.dataUri), {
    message: 'Provide exactly one of series or dataUri',
  });

/** Protocol adapter that defers the plotting implementation until the surface is visible. */
export const ClioTimeSeriesCatalogComponent = createComponentImplementation(
  { name: 'clio.time-series.v1', schema },
  ({ props }) =>
    createElement(
      Suspense,
      { fallback: createElement('div', { className: 'h-48 animate-pulse rounded-lg bg-muted' }) },
      createElement(LazyTimeSeries, {
        accessibility: props.accessibility,
        dataUri: props.dataUri,
        rows: props.series as PlotRow[] | undefined,
        title: props.title,
        xKey: props.xKey,
        yKeys: props.yKeys,
      }),
    ),
);
