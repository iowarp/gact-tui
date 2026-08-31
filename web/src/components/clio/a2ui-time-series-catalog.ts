import { createComponentImplementation } from '@a2ui/react/v0_9';
import { CommonSchemas } from '@a2ui/web_core/v0_9';
import { createElement } from 'react';
import { z } from 'zod';
import { ClioA2UITimeSeries } from './a2ui-time-series';
import type { PlotRow } from './time-series-plot';

const plotValue = z.union([z.string(), z.number(), z.null()]);
const schema = z
  .object({
    series: z.array(z.record(plotValue)).max(10_000).optional(),
    dataUri: z.string().optional(),
    xKey: z.string(),
    yKeys: z.array(z.string()).min(1).max(5),
    title: CommonSchemas.DynamicString.optional(),
    accessibility: CommonSchemas.AccessibilityAttributes.optional(),
    weight: z.number().optional(),
  })
  .strict()
  .refine((value) => Boolean(value.series) !== Boolean(value.dataUri), {
    message: 'Provide exactly one of series or dataUri',
  });

/** Protocol adapter for the shared interactive plotting implementation. */
export const ClioTimeSeriesCatalogComponent = createComponentImplementation(
  { name: 'clio.time-series.v1', schema },
  ({ props }) =>
    createElement(ClioA2UITimeSeries, {
      accessibility: props.accessibility,
      dataUri: props.dataUri,
      rows: props.series as PlotRow[] | undefined,
      title: props.title,
      xKey: props.xKey,
      yKeys: props.yKeys,
    }),
);
