import { lazy, Suspense } from 'react';
import { z } from 'zod';
import { Skeleton } from '@/components/ui/skeleton';
import { boundPath, useBoundValue, type BoundDataContext } from './bound-value';
import { dataViewFlexStyle } from './data-view-layout';
import { type MapLayer } from './layered-map-model';
import { type MapCameraProps } from './map-camera';
import { isBoundToPath, type SelectionWriter } from './selection-state';
import type { TableDataQuery } from './table-query-rows';
import type { layeredMapSchema } from './a2ui-layered-map-catalog';

const LazyLayeredMap = lazy(() =>
  import('./a2ui-layered-map').then((module) => ({ default: module.ClioLayeredMap })),
);

export function LayeredMapAdapter({
  props,
  dataContext,
  componentId,
  rawProperties,
}: {
  props: z.infer<typeof layeredMapSchema> & Record<string, unknown>;
  dataContext: BoundDataContext;
  componentId: string;
  rawProperties: Record<string, unknown>;
}) {
  const [, writeDraw] = useBoundValue(dataContext, props.draw?.value);
  const [edits, writeEdits] = useBoundValue(dataContext, props.edits);
  const cameraProps: MapCameraProps = {
    camera: props.camera,
    setCamera: isBoundToPath(rawProperties.camera)
      ? (props.setCamera as MapCameraProps['setCamera'])
      : undefined,
  };
  const queries = Object.fromEntries(
    props.layers.map((layer: MapLayer) => [
      layer.id,
      layer.dataQuery as TableDataQuery | undefined,
    ]),
  );
  return (
    <div style={dataViewFlexStyle(props.weight)}>
      <Suspense fallback={<Skeleton aria-busy className="h-96" />}>
        <LazyLayeredMap
          {...cameraProps}
          componentId={componentId}
          title={props.title as string | undefined}
          layers={props.layers}
          time={props.time}
          timeField={props.timeField}
          setTime={
            isBoundToPath(rawProperties.time) ? (props.setTime as SelectionWriter) : undefined
          }
          selection={props.selection}
          selectionField={props.selectionField}
          setSelection={
            isBoundToPath(rawProperties.selection)
              ? (props.setSelection as SelectionWriter)
              : undefined
          }
          drawMode={props.draw?.mode}
          writeDraw={
            boundPath(props.draw?.value) ? (writeDraw as (geometry: unknown) => void) : undefined
          }
          edits={edits}
          writeEdits={writeEdits}
          queries={queries}
          action={props.action ? () => void (props.action as unknown as () => void)() : undefined}
          actionLabel={props.actionLabel as string | undefined}
          height={props.height}
        />
      </Suspense>
    </div>
  );
}
