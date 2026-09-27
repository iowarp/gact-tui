import { createComponentImplementation } from '@a2ui/react/v0_9';
import { CommonSchemas } from '@a2ui/web_core/v0_9';
import { useMemo } from 'react';
import { z } from 'zod';
import {
  a2uiAccessibilityDescription,
  a2uiAccessibilityLabel,
  type A2UIAccessibility,
} from './a2ui-accessibility';
import { ClioDataTable, type ClioDataColumn, type ClioDataRow } from './data-table';
import {
  isBoundToPath,
  isSelectionValue,
  parseSelectionState,
  selectionIncludes,
  type SelectionWriter,
} from './selection-state';

function columnKey(column: ClioDataColumn): string {
  return typeof column === 'string' ? column : column.key;
}

export interface ClioSelectableDataTableProps {
  accessibility?: A2UIAccessibility;
  columns: ClioDataColumn[];
  rows: ClioDataRow[];
  componentId: string;
  /** The resolved `selection` value; a `SelectionState` when it is bound to `/selection/<key>`. */
  selection?: unknown;
  /** Present only when `selection` is bound to a data-model path. */
  setSelection?: SelectionWriter;
  action?: () => void;
}

/**
 * `clio.data-table.v1` with a linked selection: rows whose value of the bound
 * selection's field is selected are highlighted, and clicking a row selects
 * its key — the bound field when it is one of the table's columns, otherwise
 * the first column — for every component bound to the same path.
 */
export function ClioSelectableDataTable({
  accessibility,
  action,
  columns,
  componentId,
  rows,
  selection,
  setSelection,
}: ClioSelectableDataTableProps) {
  const state = useMemo(() => parseSelectionState(selection), [selection]);
  const keys = useMemo(() => columns.map(columnKey), [columns]);
  const keyColumn = state && keys.includes(state.field) ? state.field : keys[0];
  const selectedRows = useMemo(() => {
    if (!state) return undefined;
    const selected = new Set<number>();
    rows.forEach((row, index) => {
      if (selectionIncludes(state, row[state.field])) selected.add(index);
    });
    return selected;
  }, [rows, state]);

  const selectRow = (row: ClioDataRow) => {
    const value = keyColumn === undefined ? undefined : row[keyColumn];
    if (keyColumn !== undefined && isSelectionValue(value)) {
      // Clicking the one selected row again clears the selection.
      const onlyThis =
        state?.field === keyColumn && state.values.length === 1 && selectionIncludes(state, value);
      setSelection?.({ field: keyColumn, values: onlyThis ? [] : [value], source: componentId });
    }
    action?.();
  };

  return (
    <ClioDataTable
      columns={columns}
      description={a2uiAccessibilityDescription(accessibility)}
      label={a2uiAccessibilityLabel(accessibility)}
      onRowClick={setSelection || action ? selectRow : undefined}
      rows={rows}
      selectedRows={selectedRows}
    />
  );
}

// The catalog adapter shares the validated schema with the selectable table above.
// oxlint-disable-next-line react/only-export-components
export const ClioDataTableCatalogComponent = createComponentImplementation(
  {
    name: 'clio.data-table.v1',
    schema: z
      .object({
        columns: z.array(
          z.union([z.string(), z.object({ key: z.string(), label: z.string() }).strict()]),
        ),
        rows: z.array(z.record(z.unknown())),
        // clio-schemas 0.5.0: a DynamicValue (a plain string, the old form, still parses).
        selection: CommonSchemas.DynamicValue.optional(),
        action: CommonSchemas.Action.optional(),
        accessibility: CommonSchemas.AccessibilityAttributes.optional(),
        weight: z.number().optional(),
      })
      .strict(),
  },
  ({ props, context }) => (
    <ClioSelectableDataTable
      accessibility={props.accessibility}
      action={props.action ? () => void props.action?.() : undefined}
      columns={props.columns as ClioDataColumn[]}
      componentId={context.componentModel.id}
      rows={props.rows as ClioDataRow[]}
      selection={props.selection}
      setSelection={
        isBoundToPath(context.componentModel.properties.selection)
          ? (props.setSelection as unknown as SelectionWriter)
          : undefined
      }
    />
  ),
);
