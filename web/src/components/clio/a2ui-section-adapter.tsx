import { lazy, Suspense } from 'react';
import { z } from 'zod';
import { Skeleton } from '@/components/ui/skeleton';
import { useBoundValue, type BoundDataContext } from './bound-value';
import { dataViewFlexStyle } from './data-view-layout';
import { isBoundToPath, type SelectionWriter } from './selection-state';
import type { sectionSchema } from './a2ui-section-catalog';

const LazySection = lazy(() =>
  import('./a2ui-section').then((module) => ({ default: module.ClioSection })),
);

export function SectionAdapter({
  props,
  dataContext,
  componentId,
  rawProperties,
}: {
  props: z.infer<typeof sectionSchema> & Record<string, unknown>;
  dataContext: BoundDataContext;
  componentId: string;
  rawProperties: Record<string, unknown>;
}) {
  const [, writePointer] = useBoundValue(dataContext, props.pointer);
  return (
    <div style={dataViewFlexStyle(props.weight)}>
      <Suspense fallback={<Skeleton aria-busy className="h-80" />}>
        <LazySection
          key={props.sectionUri as string}
          componentId={componentId}
          sectionUri={props.sectionUri as string}
          title={props.title as string | undefined}
          variable={props.variable}
          variables={props.variables}
          colormap={props.colormap}
          valueRange={props.valueRange}
          unit={props.unit}
          contourInterval={props.contourInterval}
          invertVertical={props.invertVertical}
          selection={props.selection}
          selectionField={props.selectionField}
          setSelection={
            isBoundToPath(rawProperties.selection)
              ? (props.setSelection as SelectionWriter)
              : undefined
          }
          writePointer={writePointer}
          height={props.height}
        />
      </Suspense>
    </div>
  );
}
