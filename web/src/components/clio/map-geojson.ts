import type { FeatureCollection, Geometry, Position } from 'geojson';
import type { ScientificMapPoint } from './scientific-map-view';

const MAX_GEOJSON_FEATURES = 20_000;

export interface ParsedMapGeoJson {
  collection: FeatureCollection;
  points: ScientificMapPoint[];
  bounds: [[number, number], [number, number]];
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function positions(geometry: Record<string, unknown>, featureIndex: number): Position[] {
  const type = geometry.type;
  if (type === 'GeometryCollection') {
    if (!Array.isArray(geometry.geometries))
      throw new Error(`GeoJSON feature ${featureIndex + 1}: GeometryCollection.geometries must be an array.`);
    return geometry.geometries.flatMap((item: unknown) => {
      const nested = object(item);
      if (!nested) throw new Error(`GeoJSON feature ${featureIndex + 1}: invalid nested geometry.`);
      return positions(nested, featureIndex);
    });
  }
  if (!['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'].includes(String(type)))
    throw new Error(`GeoJSON feature ${featureIndex + 1}: unsupported geometry type ${String(type)}.`);
  const result: Position[] = [];
  const walk = (value: unknown): void => {
    if (!Array.isArray(value))
      throw new Error(`GeoJSON feature ${featureIndex + 1}: coordinates must be nested arrays.`);
    if (typeof value[0] === 'number') {
      const [longitude, latitude] = value;
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90)
        throw new Error(`GeoJSON feature ${featureIndex + 1}: longitude/latitude is outside valid bounds.`);
      result.push(value as Position);
      return;
    }
    for (const child of value) walk(child);
  };
  walk(geometry.coordinates);
  if (!result.length) throw new Error(`GeoJSON feature ${featureIndex + 1}: geometry has no positions.`);
  return result;
}

/** Parse one referenced FeatureCollection into a geometry layer and selectable feature centres. */
export function parseMapGeoJson(
  text: string,
  fields: { labelField?: string; detailField?: string; categoryField?: string; valueField?: string; selectionField?: string },
): ParsedMapGeoJson {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch (error) {
    throw new Error(`GeoJSON artifact is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const document = object(decoded);
  if (document?.type !== 'FeatureCollection' || !Array.isArray(document.features))
    throw new Error('GeoJSON artifact must contain a FeatureCollection with a features array.');
  if (!document.features.length) throw new Error('GeoJSON FeatureCollection has no features.');
  if (document.features.length > MAX_GEOJSON_FEATURES)
    throw new Error(`GeoJSON has ${document.features.length} features; the map limit is ${MAX_GEOJSON_FEATURES}. Filter the source first.`);
  const ids = new Set<string>();
  const points: ScientificMapPoint[] = [];
  const features: FeatureCollection['features'] = [];
  let west = 180, east = -180, south = 90, north = -90;
  document.features.forEach((value: unknown, index: number) => {
    const feature = object(value);
    const geometry = object(feature?.geometry);
    if (feature?.type !== 'Feature' || !geometry)
      throw new Error(`GeoJSON feature ${index + 1}: expected a Feature with geometry.`);
    const coordinates = positions(geometry, index);
    let featureWest = 180, featureEast = -180, featureSouth = 90, featureNorth = -90;
    for (const [longitude, latitude] of coordinates) {
      featureWest = Math.min(featureWest, longitude);
      featureEast = Math.max(featureEast, longitude);
      featureSouth = Math.min(featureSouth, latitude);
      featureNorth = Math.max(featureNorth, latitude);
    }
    west = Math.min(west, featureWest); east = Math.max(east, featureEast);
    south = Math.min(south, featureSouth); north = Math.max(north, featureNorth);
    const properties = object(feature.properties) ?? {};
    const id = String(feature.id ?? properties.id ?? `feature-${index + 1}`);
    if (ids.has(id)) throw new Error(`GeoJSON feature ${index + 1}: duplicate id ${id}.`);
    ids.add(id);
    const labelValue = fields.labelField ? properties[fields.labelField] : undefined;
    const detailValue = fields.detailField ? properties[fields.detailField] : undefined;
    const categoryValue = fields.categoryField ? properties[fields.categoryField] : undefined;
    const valueValue = fields.valueField ? properties[fields.valueField] : undefined;
    const selectionValue = fields.selectionField === 'id'
      ? id
      : fields.selectionField && fields.selectionField !== '__row'
        ? properties[fields.selectionField]
        : index;
    if (typeof selectionValue !== 'string' && typeof selectionValue !== 'number')
      throw new Error(`GeoJSON feature ${index + 1}: selectionField ${fields.selectionField} needs a string or number property.`);
    points.push({
      id,
      label: labelValue === undefined || labelValue === null ? id : String(labelValue),
      latitude: (featureSouth + featureNorth) / 2,
      longitude: (featureWest + featureEast) / 2,
      ...(detailValue === undefined || detailValue === null ? {} : { detail: String(detailValue) }),
      ...(categoryValue === undefined || categoryValue === null ? {} : { category: String(categoryValue) }),
      ...(typeof valueValue === 'number' && Number.isFinite(valueValue) ? { value: valueValue } : {}),
      selectionValue,
    });
    features.push({
      type: 'Feature',
      id,
      geometry: geometry as unknown as Geometry,
      properties: { ...properties, id },
    });
  });
  return { collection: { type: 'FeatureCollection', features }, points, bounds: [[west, south], [east, north]] };
}
