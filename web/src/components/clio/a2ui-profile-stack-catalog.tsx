import { createComponentImplementation } from '@a2ui/react/v0_9';
import { CommonSchemas } from '@a2ui/web_core/v0_9';
import { z } from 'zod';
import { refinedStrictObject } from './a2ui-refined-schema';
import { type BoundDataContext } from './bound-value';
import { dataQuerySchema, fieldNameSchema } from './data-query-schema';
import { isBoundToPath } from './selection-state';
import { TABLE_DATA_URI } from './table-query-rows';
import { ProfileStackAdapter } from './a2ui-profile-stack-adapter';

export const profileStackSchema = refinedStrictObject(
  {
    title: CommonSchemas.DynamicString.optional(),
    data: z
      .array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])))
      .min(1)
      .max(5000)
      .optional(),
    dataUri: z.string().regex(TABLE_DATA_URI).optional(),
    dataQuery: dataQuerySchema.optional(),
    profileField: fieldNameSchema,
    verticalField: fieldNameSchema,
    valueField: fieldNameSchema,
    variables: z.array(fieldNameSchema).min(1).max(12).optional(),
    overlayField: fieldNameSchema.optional(),
    labelField: fieldNameSchema.optional(),
    categoryField: fieldNameSchema.optional(),
    invertVertical: z.boolean().optional(),
    unit: z.string().max(40).optional(),
    verticalUnit: z.string().max(40).optional(),
    selection: CommonSchemas.DynamicValue.optional(),
    selectionField: fieldNameSchema.optional(),
    excluded: z
      .object({ path: z.string().min(1) })
      .strict()
      .optional(),
    action: CommonSchemas.Action.optional(),
    actionLabel: CommonSchemas.DynamicString.optional(),
    height: z.number().int().min(160).max(2000).optional(),
    accessibility: CommonSchemas.AccessibilityAttributes.optional(),
    weight: z.number().optional(),
  },
  (value, context) => {
    if (Boolean(value.data) === Boolean(value.dataUri))
      // i18n-ignore: validation message returned to the agent
      context.addIssue({ code: 'custom', message: 'Provide exactly one of data or dataUri' });
    if (value.dataQuery && !value.dataUri)
      // i18n-ignore: validation message returned to the agent
      context.addIssue({ code: 'custom', message: 'dataQuery applies only to dataUri' });
    if (isBoundToPath(value.selection) && !value.selectionField)
      // i18n-ignore: validation message returned to the agent
      context.addIssue({
        code: 'custom',
        path: ['selectionField'],
        // i18n-ignore: validation message returned to the agent
        message: 'selectionField is required when selection is bound',
      });
  },
);

/** Protocol adapter for `clio.profile-stack.v1`. */
export const ClioProfileStackCatalogComponent = createComponentImplementation(
  { name: 'clio.profile-stack.v1', schema: profileStackSchema },
  ({ props, context }) => (
    <ProfileStackAdapter
      props={props as never}
      dataContext={context.dataContext as unknown as BoundDataContext}
      componentId={context.componentModel.id}
      rawProperties={context.componentModel.properties as Record<string, unknown>}
    />
  ),
);
