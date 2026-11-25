import { createComponentImplementation } from '@a2ui/react/v0_9';
import { CommonSchemas } from '@a2ui/web_core/v0_9';
import { z } from 'zod';
import { refinedStrictObject } from './a2ui-refined-schema';
import type { BoundDataContext } from './bound-value';
import { fieldNameSchema } from './data-query-schema';
import { mapLayerSchema } from './layered-map-model';
import { mapCameraSchema } from './map-camera';
import { isBoundToPath } from './selection-state';
import { LayeredMapAdapter } from './a2ui-layered-map-adapter';

const binding = z.object({ path: z.string().min(1) }).strict();

export const layeredMapSchema = refinedStrictObject(
  {
    title: CommonSchemas.DynamicString.optional(),
    camera: z.union([mapCameraSchema, binding]).optional(),
    layers: z.array(mapLayerSchema).min(1).max(12),
    time: CommonSchemas.DynamicValue.optional(),
    timeField: fieldNameSchema.optional(),
    selection: CommonSchemas.DynamicValue.optional(),
    selectionField: fieldNameSchema.optional(),
    draw: z
      .object({ mode: z.enum(['box', 'path', 'point']), value: binding })
      .strict()
      .optional(),
    edits: binding.optional(),
    action: CommonSchemas.Action.optional(),
    actionLabel: CommonSchemas.DynamicString.optional(),
    height: z.number().int().min(160).max(2000).optional(),
    accessibility: CommonSchemas.AccessibilityAttributes.optional(),
    weight: z.number().optional(),
  },
  (value, context) => {
    const ids = value.layers.map((layer) => layer.id);
    if (new Set(ids).size !== ids.length)
      // i18n-ignore: validation message returned to the agent
      context.addIssue({ code: 'custom', path: ['layers'], message: 'layer ids must be unique' });
    if (isBoundToPath(value.time) && !value.timeField)
      // i18n-ignore: validation message returned to the agent
      context.addIssue({
        code: 'custom',
        path: ['timeField'],
        // i18n-ignore: validation message returned to the agent
        message: 'timeField is required when time is bound',
      });
    if (isBoundToPath(value.selection) && !value.selectionField)
      // i18n-ignore: validation message returned to the agent
      context.addIssue({
        code: 'custom',
        path: ['selectionField'],
        // i18n-ignore: validation message returned to the agent
        message: 'selectionField is required when selection is bound',
      });
    const editable = value.layers.some((layer) => layer.editable);
    if (editable !== Boolean(value.edits))
      // i18n-ignore: validation message returned to the agent
      context.addIssue({
        code: 'custom',
        path: ['edits'],
        message: 'an editable points layer and edits go together',
      });
  },
);

/** Protocol adapter for `clio.layered-map.v1`. */
export const ClioLayeredMapCatalogComponent = createComponentImplementation(
  { name: 'clio.layered-map.v1', schema: layeredMapSchema },
  ({ props, context }) => (
    <LayeredMapAdapter
      props={props as never}
      dataContext={context.dataContext as unknown as BoundDataContext}
      componentId={context.componentModel.id}
      rawProperties={context.componentModel.properties as Record<string, unknown>}
    />
  ),
);
