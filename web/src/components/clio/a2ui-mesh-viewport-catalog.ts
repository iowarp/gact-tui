import { createComponentImplementation } from '@a2ui/react/v0_9';
import { CommonSchemas } from '@a2ui/web_core/v0_9';
import { createElement, lazy, Suspense } from 'react';
import { z } from 'zod';
import { Skeleton } from '@/components/ui/skeleton';
import type { MeshCameraState } from './mesh-viewport-sync';
import { ViewerFileGate } from './viewer-file-gate';
import { viewerFileUriSchema } from './viewer-file-schema';

// three.js is only fetched once a surface actually contains a viewport.
const LazyMeshViewport = lazy(() =>
  import('./a2ui-mesh-viewport').then((module) => ({ default: module.ClioMeshViewport })),
);

export const meshViewportSchema = z
  .object({
    // Literal or bound (a list's selection can drive one viewer); the resolved value
    // must be a registered artifact, which the gate checks and says in words.
    meshUri: viewerFileUriSchema,
    format: z
      .enum(['glb', 'gltf', 'obj', 'stl', 'ply', 'fbx', '3mf', 'vtk', 'vtp', 'drc'])
      .optional(),
    materialUri: viewerFileUriSchema.optional(),
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
    height: z.number().int().min(160).max(2000).optional(),
    accessibility: CommonSchemas.AccessibilityAttributes.optional(),
    weight: z.number().optional(),
  })
  .strict();

/** Protocol adapter for `clio.mesh-viewport.v1`; the renderer loads on first use. */
export const ClioMeshViewportCatalogComponent = createComponentImplementation(
  { name: 'clio.mesh-viewport.v1', schema: meshViewportSchema },
  ({ props, context }) =>
    createElement(
      ViewerFileGate,
      { noun: '3D view', files: [props.meshUri, props.materialUri], height: props.height },
      createElement(
        Suspense,
        { fallback: createElement(Skeleton, { 'aria-busy': true, className: 'h-80 rounded-lg' }) },
        createElement(LazyMeshViewport, {
          accessibility: props.accessibility,
          componentId: context.componentModel.id,
          // The binder writes back only when `camera` is bound to a data-model path.
          camera: props.camera,
          setCamera: props.setCamera as unknown as ((value: MeshCameraState) => void) | undefined,
          field: props.field,
          frame: props.frame,
          meshUri: props.meshUri,
          format: props.format,
          materialUri: props.materialUri,
          showField: props.showField,
          syncGroup: props.syncGroup,
          thresholdField: props.thresholdField,
          thresholdMax: props.thresholdMax,
          thresholdMin: props.thresholdMin,
          title: props.title,
          upAxis: props.upAxis,
          height: props.height,
          weight: props.weight,
        }),
      ),
    ),
);
