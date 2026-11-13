/**
 * `clio.data-table.v1` in the A2UI catalog: its schema, the cross-field rules
 * the agent's component must meet, and the binding to the table views.
 */
import { createComponentImplementation } from '@a2ui/react/v0_9';
import { CommonSchemas } from '@a2ui/web_core/v0_9';
import { z } from 'zod';
import { ClioDataTableArtifactSource, ClioSelectableDataTable } from './a2ui-data-table';
import { refinedStrictObject } from './a2ui-refined-schema';
import { BoundDataQuery } from './bound-data-query';
import { dataQuerySchema, fieldNameSchema } from './data-query-schema';
import type { ClioDataColumn, ClioDataRow } from './data-table';
import { dataViewFlexStyle } from './data-view-layout';
import { isBoundToPath, type SelectionWriter } from './selection-state';
import { TABLE_DATA_URI, type TableDataQuery } from './table-query-rows';

const dataTableDataProperties = {
  columns: z
    .array(z.union([z.string(), z.object({ key: z.string(), label: z.string() }).strict()]))
    .optional(),
  rows: z.array(z.record(z.unknown())).optional(),
  dataUri: z.string().regex(TABLE_DATA_URI).optional(),
  dataQuery: dataQuerySchema.optional(),
  // clio-schemas 0.5.1: a DynamicValue (a plain string, the old form, still parses).
  selection: CommonSchemas.DynamicValue.optional(),
  // A dataset column name; required when `selection` is bound (mirrors the chart's selectionField).
  selectionField: fieldNameSchema.optional(),
  action: CommonSchemas.Action.optional(),
  pageSize: z
    .union([z.literal(10), z.literal(25), z.literal(50), z.literal(100), z.literal(500)])
    .optional(),
  accessibility: CommonSchemas.AccessibilityAttributes.optional(),
  weight: z.number().optional(),
};

type DataTableShape = z.infer<z.ZodObject<typeof dataTableDataProperties>>;

/** `clio.data-table.v1`'s cross-field rules: exactly one of `rows` or `dataUri`. */
function checkDataTableComponent(value: DataTableShape, context: z.RefinementCtx): void {
  if (Boolean(value.rows) === Boolean(value.dataUri)) {
    // i18n-ignore: validation message returned to the agent
    context.addIssue({ code: 'custom', message: 'Provide exactly one of rows or dataUri' });
  }
  if (value.rows && !value.columns) {
    context.addIssue({ code: 'custom', message: 'columns is required with inline rows' });
  }
  if (value.dataQuery && !value.dataUri) {
    // i18n-ignore: validation message returned to the agent
    context.addIssue({ code: 'custom', message: 'dataQuery applies only to dataUri' });
  }
  if (isBoundToPath(value.selection) && !value.selectionField) {
    context.addIssue({
      code: 'custom',
      // i18n-ignore: validation message returned to the agent
      message: 'selectionField is required when selection is bound',
    });
  }
}

// The catalog adapter shares the validated schema with the selectable table above.
// oxlint-disable-next-line react/only-export-components
export const dataTableComponentSchema = refinedStrictObject(
  dataTableDataProperties,
  checkDataTableComponent,
);

// oxlint-disable-next-line react/only-export-components
export const ClioDataTableCatalogComponent = createComponentImplementation(
  { name: 'clio.data-table.v1', schema: dataTableComponentSchema },
  ({ props, context }) => {
    const setSelection = isBoundToPath(context.componentModel.properties.selection)
      ? (props.setSelection as unknown as SelectionWriter)
      : undefined;
    return (
      <div style={dataViewFlexStyle(props.weight)}>
        {props.dataUri ? (
          <BoundDataQuery
            dataContext={context.dataContext}
            query={props.dataQuery as TableDataQuery | undefined}
          >
            {(resolvedQuery) => (
              <ClioDataTableArtifactSource
                accessibility={props.accessibility}
                action={props.action ? () => void props.action?.() : undefined}
                columns={props.columns as ClioDataColumn[] | undefined}
                componentId={context.componentModel.id}
                dataQuery={resolvedQuery}
                dataUri={props.dataUri!}
                selection={props.selection}
                selectionField={props.selectionField}
                setSelection={setSelection}
                pageSize={props.pageSize}
              />
            )}
          </BoundDataQuery>
        ) : (
          <ClioSelectableDataTable
            accessibility={props.accessibility}
            action={props.action ? () => void props.action?.() : undefined}
            columns={props.columns as ClioDataColumn[]}
            componentId={context.componentModel.id}
            rows={props.rows as ClioDataRow[]}
            selection={props.selection}
            selectionField={props.selectionField}
            setSelection={setSelection}
            pageSize={props.pageSize}
          />
        )}
      </div>
    );
  },
);
