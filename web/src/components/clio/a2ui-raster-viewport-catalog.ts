import { createComponentImplementation } from '@a2ui/react/v0_9';
import { CommonSchemas } from '@a2ui/web_core/v0_9';
import { createElement, lazy, Suspense } from 'react';
import { z } from 'zod';
import { Skeleton } from '@/components/ui/skeleton';

const LazyRasterViewport = lazy(() =>
  import('./a2ui-raster-viewport').then((module) => ({ default: module.ClioRasterViewport })),
);

export const rasterViewportSchema = z.object({
  rasterUri: z.string().regex(/^artifact:\/\/artifact_[A-Za-z0-9_-]+$/u),
  title: CommonSchemas.DynamicString.optional(),
  variable: z.string().optional(),
  band: z.number().int().min(1).optional(),
  colormap: z.enum(['viridis', 'magma', 'plasma', 'cividis', 'turbo', 'grayscale']).optional(),
  unit: z.string().optional(),
  accessibility: CommonSchemas.AccessibilityAttributes.optional(),
  weight: z.number().optional(),
}).strict();

/** Protocol adapter for a registered grid sampled by the raster-query route. */
export const ClioRasterViewportCatalogComponent = createComponentImplementation(
  { name: 'clio.raster-viewport.v1', schema: rasterViewportSchema },
  ({ props, context }) => createElement(Suspense, { fallback: createElement(Skeleton, { className: 'h-80' }) },
    createElement(LazyRasterViewport, { ...props, componentId: context.componentModel.id })),
);
