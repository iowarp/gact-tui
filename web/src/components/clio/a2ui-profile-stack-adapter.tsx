import { lazy, Suspense } from 'react';
import { z } from 'zod';
import { Skeleton } from '@/components/ui/skeleton';
import { BoundDataQuery } from './bound-data-query';
import { useBoundValue, type BoundDataContext } from './bound-value';
import { dataViewFlexStyle } from './data-view-layout';
import { isBoundToPath, type SelectionWriter } from './selection-state';
import { type QueryRow, type TableDataQuery } from './table-query-rows';
import type { profileStackSchema } from './a2ui-profile-stack-catalog';

const LazyProfileStack = lazy(() =>
  import('./a2ui-profile-stack').then((module) => ({ default: module.ClioProfileStack })),
);

export function ProfileStackAdapter({
  props,
  dataContext,
  componentId,
  rawProperties,
}: {
  props: z.infer<typeof profileStackSchema> & Record<string, unknown>;
  dataContext: BoundDataContext;
  componentId: string;
  rawProperties: Record<string, unknown>;
}) {
  const [excluded, writeExcluded] = useBoundValue(dataContext, props.excluded);
  const view = (query: TableDataQuery | undefined) => (
    <LazyProfileStack
      componentId={componentId}
      title={props.title as string | undefined}
      data={props.data as QueryRow[] | undefined}
      dataUri={props.dataUri}
      dataQuery={query}
      profileField={props.profileField}
      verticalField={props.verticalField}
      valueField={props.valueField}
      variables={props.variables}
      overlayField={props.overlayField}
      labelField={props.labelField}
      categoryField={props.categoryField}
      invertVertical={props.invertVertical ?? true}
      unit={props.unit}
      verticalUnit={props.verticalUnit}
      selection={props.selection}
      selectionField={props.selectionField}
      setSelection={
        isBoundToPath(rawProperties.selection) ? (props.setSelection as SelectionWriter) : undefined
      }
      excluded={excluded}
      writeExcluded={writeExcluded as ((ids: string[]) => void) | undefined}
      action={props.action ? () => void (props.action as unknown as () => void)() : undefined}
      actionLabel={props.actionLabel as string | undefined}
      height={props.height}
    />
  );
  return (
    <div style={dataViewFlexStyle(props.weight)}>
      <Suspense fallback={<Skeleton aria-busy className="h-80" />}>
        {props.dataUri ? (
          <BoundDataQuery
            dataContext={dataContext}
            query={props.dataQuery as TableDataQuery | undefined}
          >
            {view}
          </BoundDataQuery>
        ) : (
          view(undefined)
        )}
      </Suspense>
    </div>
  );
}
