import { createComponentImplementation } from '@a2ui/react/v0_9';
import { CommonSchemas } from '@a2ui/web_core/v0_9';
import { createElement, lazy, Suspense } from 'react';
import { z } from 'zod';
import { Skeleton } from '@/components/ui/skeleton';
import { ViewerFileGate } from './viewer-file-gate';
import { viewerFileUriSchema } from './viewer-file-schema';

const LazyRasterViewport = lazy(() =>
  import('./a2ui-raster-viewport').then((module) => ({ default: module.ClioRasterViewport })),
);

export const rasterViewportSchema = z
  .object({
    // Literal or bound; the gate checks the resolved value is a registered artifact.
    rasterUri: viewerFileUriSchema,
    title: CommonSchemas.DynamicString.optional(),
    variable: z.string().optional(),
    band: z.number().int().min(1).optional(),
    colormap: z.enum(['viridis', 'magma', 'plasma', 'cividis', 'turbo', 'grayscale']).optional(),
    unit: z.string().optional(),
    height: z.number().int().min(160).max(2000).optional(),
    accessibility: CommonSchemas.AccessibilityAttributes.optional(),
    weight: z.number().optional(),
  })
  .strict();

/** Protocol adapter for a registered grid sampled by the raster-query route. */
export const ClioRasterViewportCatalogComponent = createComponentImplementation(
  { name: 'clio.raster-viewport.v1', schema: rasterViewportSchema },
  ({ props, context }) =>
    createElement(
      ViewerFileGate,
      { noun: 'raster view', files: [props.rasterUri], height: props.height },
      createElement(
        Suspense,
        { fallback: createElement(Skeleton, { 'aria-busy': true, className: 'h-80' }) },
        // A new file is a new grid: keyed by it, the view starts from the full extent.
        createElement(LazyRasterViewport, {
          ...props,
          key: props.rasterUri,
          componentId: context.componentModel.id,
        }),
      ),
    ),
);
