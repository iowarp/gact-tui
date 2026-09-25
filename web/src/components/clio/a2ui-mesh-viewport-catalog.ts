import { createComponentImplementation } from '@a2ui/react/v0_9';
import { CommonSchemas } from '@a2ui/web_core/v0_9';
import { createElement, lazy, Suspense } from 'react';
import { z } from 'zod';
import type { MeshCameraState } from './mesh-viewport-sync';

// three.js is only fetched once a surface actually contains a viewport.
const LazyMeshViewport = lazy(() =>
  import('./a2ui-mesh-viewport').then((module) => ({ default: module.ClioMeshViewport })),
);

export const meshViewportSchema = z
  .object({
    meshUri: z.string().regex(/^artifact:\/\/artifact_[A-Za-z0-9_-]+$/u),
    title: CommonSchemas.DynamicString.optional(),
    field: CommonSchemas.DynamicString.optional(),
    showField: CommonSchemas.DynamicBoolean.optional(),
    frame: CommonSchemas.DynamicNumber.optional(),
    thresholdField: z.string().optional(),
    thresholdMin: CommonSchemas.DynamicNumber.optional(),
    thresholdMax: CommonSchemas.DynamicNumber.optional(),
    camera: CommonSchemas.DynamicValue.optional(),
    syncGroup: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/u)
      .optional(),
    upAxis: z.enum(['x', 'y', 'z']).optional(),
    accessibility: CommonSchemas.AccessibilityAttributes.optional(),
    weight: z.number().optional(),
  })
  .strict();

/** Protocol adapter for `clio.mesh-viewport.v1`; the renderer loads on first use. */
export const ClioMeshViewportCatalogComponent = createComponentImplementation(
  { name: 'clio.mesh-viewport.v1', schema: meshViewportSchema },
  ({ props }) =>
    createElement(
      Suspense,
      { fallback: createElement('div', { className: 'h-80 animate-pulse rounded-lg bg-muted' }) },
      createElement(LazyMeshViewport, {
        accessibility: props.accessibility,
        // The binder writes back only when `camera` is bound to a data-model path.
        camera: props.camera,
        setCamera: props.setCamera as unknown as ((value: MeshCameraState) => void) | undefined,
        field: props.field,
        frame: props.frame,
        meshUri: props.meshUri,
        showField: props.showField,
        syncGroup: props.syncGroup,
        thresholdField: props.thresholdField,
        thresholdMax: props.thresholdMax,
        thresholdMin: props.thresholdMin,
        title: props.title,
        upAxis: props.upAxis,
        weight: props.weight,
      }),
    ),
);
