import { createComponentImplementation } from '@a2ui/react/v0_9';
import { CommonSchemas } from '@a2ui/web_core/v0_9';
import { z } from 'zod';
import { refinedStrictObject } from './a2ui-refined-schema';
import { type BoundDataContext } from './bound-value';
import { fieldNameSchema } from './data-query-schema';
import { FIELD_COLORMAPS } from './layered-map-model';
import { isBoundToPath } from './selection-state';
import { viewerFileUriSchema } from './viewer-file-schema';
import { SectionAdapter } from './a2ui-section-adapter';

export const sectionSchema = refinedStrictObject(
  {
    title: CommonSchemas.DynamicString.optional(),
    sectionUri: viewerFileUriSchema,
    variable: fieldNameSchema.optional(),
    variables: z.array(fieldNameSchema).min(1).max(12).optional(),
    colormap: z.enum(FIELD_COLORMAPS).optional(),
    valueRange: z.tuple([z.number(), z.number()]).optional(),
    unit: z.string().max(40).optional(),
    contourInterval: z.number().positive().optional(),
    invertVertical: z.boolean().optional(),
    selection: CommonSchemas.DynamicValue.optional(),
    selectionField: fieldNameSchema.optional(),
    pointer: z
      .object({ path: z.string().min(1) })
      .strict()
      .optional(),
    height: z.number().int().min(160).max(2000).optional(),
    accessibility: CommonSchemas.AccessibilityAttributes.optional(),
    weight: z.number().optional(),
  },
  (value, context) => {
    if (isBoundToPath(value.selection) && !value.selectionField)
      // i18n-ignore: validation message returned to the agent
      context.addIssue({
        code: 'custom',
        path: ['selectionField'],
        // i18n-ignore: validation message returned to the agent
        message: 'selectionField is required when selection is bound',
      });
    if (value.valueRange && !(value.valueRange[0] < value.valueRange[1]))
      // i18n-ignore: validation message returned to the agent
      context.addIssue({
        code: 'custom',
        path: ['valueRange'],
        message: 'valueRange must be [low, high] with low < high',
      });
  },
);

/** Protocol adapter for `clio.section.v1`. */
export const ClioSectionCatalogComponent = createComponentImplementation(
  { name: 'clio.section.v1', schema: sectionSchema },
  ({ props, context }) => (
    <SectionAdapter
      props={props as never}
      dataContext={context.dataContext as unknown as BoundDataContext}
      componentId={context.componentModel.id}
      rawProperties={context.componentModel.properties as Record<string, unknown>}
    />
  ),
);
