import { createComponentImplementation } from '@a2ui/react/v0_9';
import { CommonSchemas } from '@a2ui/web_core/v0_9';
import {
  A2UI_MAP_POINT_CATEGORY_MAX_CHARS,
  A2UI_MAP_POINT_DETAIL_MAX_CHARS,
  A2UI_MAP_POINT_ID_MAX_CHARS,
  A2UI_MAP_POINT_LABEL_MAX_CHARS,
  A2UI_MAP_POINTS_MAX,
} from '@clio/core/v3';
import { z } from 'zod';
import { ClioScientificMap } from './a2ui-map';
import { ClioMapArtifactSource } from './a2ui-map-data-source';
import { ClioMapGeoJsonSource } from './a2ui-map-geojson-source';
import { refinedStrictObject } from './a2ui-refined-schema';
import { BoundDataQuery } from './bound-data-query';
import { dataQuerySchema, fieldNameSchema } from './data-query-schema';
import { dataViewFlexStyle } from './data-view-layout';
import { isBoundToPath, type SelectionWriter } from './selection-state';
import type { TableDataQuery } from './table-query-rows';
import { mapCameraSchema, type MapCameraProps } from './map-camera';

const pointSchema = z
  .object({
    id: z.string().min(1).max(A2UI_MAP_POINT_ID_MAX_CHARS),
    label: z.string().min(1).max(A2UI_MAP_POINT_LABEL_MAX_CHARS),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    detail: z.string().max(A2UI_MAP_POINT_DETAIL_MAX_CHARS).optional(),
    category: z.string().max(A2UI_MAP_POINT_CATEGORY_MAX_CHARS).optional(),
    value: z.number().finite().optional(),
  })
  .strict();

const mapDataProperties = {
  camera: z.union([mapCameraSchema, z.object({ path: z.string().min(1) }).strict()]).optional(),
  title: CommonSchemas.DynamicString.optional(),
  points: z.array(pointSchema).min(1).max(A2UI_MAP_POINTS_MAX).optional(),
  dataUri: z
    .string()
    .regex(/^artifact:\/\/artifact_[A-Za-z0-9_-]+$/u)
    .optional(),
  geojsonUri: z
    .string()
    .regex(/^artifact:\/\/artifact_[A-Za-z0-9_-]+$/u)
    .optional(),
  dataQuery: dataQuerySchema.optional(),
  latitudeField: fieldNameSchema.optional(),
  longitudeField: fieldNameSchema.optional(),
  labelField: fieldNameSchema.optional(),
  idField: fieldNameSchema.optional(),
  trackField: fieldNameSchema.optional(),
  orderField: fieldNameSchema.optional(),
  filterFields: z
    .array(fieldNameSchema)
    .min(1)
    .max(12)
    .refine((fields) => new Set(fields).size === fields.length, 'filterFields must be distinct')
    .optional(),
  detailField: fieldNameSchema.optional(),
  categoryField: fieldNameSchema.optional(),
  valueField: fieldNameSchema.optional(),
  valueLabel: z.string().max(80).optional(),
  valueUnit: z.string().max(40).optional(),
  selected: z.string().max(A2UI_MAP_POINT_ID_MAX_CHARS).optional(),
  selection: CommonSchemas.DynamicValue.optional(),
  selectionField: fieldNameSchema.optional(),
  action: CommonSchemas.Action.optional(),
  actionLabel: CommonSchemas.DynamicString.optional(),
  accessibility: CommonSchemas.AccessibilityAttributes.optional(),
  weight: z.number().optional(),
};

type MapShape = z.infer<z.ZodObject<typeof mapDataProperties>>;

function checkMapComponent(value: MapShape, context: z.RefinementCtx): void {
  if ([value.points, value.dataUri, value.geojsonUri].filter(Boolean).length !== 1) {
    context.addIssue({
      code: 'custom',
      message: 'Provide exactly one of points, dataUri, or geojsonUri',
    });
  }
  if (value.dataUri) {
    const missing = (['latitudeField', 'longitudeField', 'labelField'] as const).filter(
      (name) => !value[name],
    );
    if (missing.length) {
      context.addIssue({ code: 'custom', message: `dataUri requires ${missing.join(', ')}` });
    }
  } else if (value.dataQuery) {
    context.addIssue({ code: 'custom', message: 'dataQuery applies only to dataUri' });
  }
  if (value.trackField && !value.dataUri) {
    context.addIssue({ code: 'custom', message: 'trackField requires dataUri' });
  }
  if (value.trackField && !value.orderField) {
    context.addIssue({ code: 'custom', message: 'trackField requires orderField' });
  }
  if (value.orderField && !value.trackField) {
    context.addIssue({ code: 'custom', message: 'orderField requires trackField' });
  }
  if (value.filterFields && !value.dataUri) {
    context.addIssue({ code: 'custom', message: 'filterFields requires dataUri' });
  }
  if (isBoundToPath(value.selection) && !value.selectionField) {
    context.addIssue({
      code: 'custom',
      message: 'selectionField is required when selection is bound',
    });
  }
  if (value.categoryField && value.valueField) {
    context.addIssue({
      code: 'custom',
      message: 'Choose categoryField or valueField for the map colour, not both',
    });
  }
}

export const mapComponentSchema = refinedStrictObject(mapDataProperties, checkMapComponent);

export const ClioMapCatalogComponent = createComponentImplementation(
  { name: 'clio.map.v1', schema: mapComponentSchema },
  ({ props, context }) => {
    const cameraProps: MapCameraProps = {
      camera: props.camera,
      setCamera: isBoundToPath(context.componentModel.properties.camera)
        ? (props.setCamera as unknown as MapCameraProps['setCamera'])
        : undefined,
    };
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
              <ClioMapArtifactSource
                {...cameraProps}
                accessibility={props.accessibility}
                action={props.action ? () => void props.action?.() : undefined}
                actionLabel={props.actionLabel}
                categoryField={props.categoryField}
                valueField={props.valueField}
                componentId={context.componentModel.id}
                dataQuery={resolvedQuery}
                dataUri={props.dataUri!}
                detailField={props.detailField}
                idField={props.idField}
                trackField={props.trackField}
                orderField={props.orderField}
                filterFields={props.filterFields as string[] | undefined}
                labelField={props.labelField!}
                latitudeField={props.latitudeField!}
                longitudeField={props.longitudeField!}
                selected={props.selected}
                selection={props.selection}
                selectionField={props.selectionField}
                setSelection={setSelection}
                title={props.title}
                valueLabel={props.valueLabel}
                valueUnit={props.valueUnit}
              />
            )}
          </BoundDataQuery>
        ) : props.geojsonUri ? (
          <ClioMapGeoJsonSource
            {...cameraProps}
            accessibility={props.accessibility}
            action={props.action ? () => void props.action?.() : undefined}
            actionLabel={props.actionLabel}
            categoryField={props.categoryField}
            componentId={context.componentModel.id}
            detailField={props.detailField}
            geojsonUri={props.geojsonUri}
            labelField={props.labelField}
            selected={props.selected}
            selection={props.selection}
            selectionField={props.selectionField}
            setSelection={setSelection}
            title={props.title}
            valueField={props.valueField}
            valueLabel={props.valueLabel}
            valueUnit={props.valueUnit}
          />
        ) : (
          <ClioScientificMap
            {...cameraProps}
            accessibility={props.accessibility}
            action={props.action ? () => void props.action?.() : undefined}
            actionLabel={props.actionLabel}
            componentId={context.componentModel.id}
            points={props.points!}
            selected={props.selected}
            selection={props.selection}
            selectionField={props.selectionField}
            setSelection={setSelection}
            title={props.title}
            valueLabel={props.valueLabel}
            valueUnit={props.valueUnit}
          />
        )}
      </div>
    );
  },
);
