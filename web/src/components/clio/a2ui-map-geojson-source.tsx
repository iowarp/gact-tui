import { useMemo } from 'react';
import { useAutoDatasetSelection } from '@/lib/a2ui/auto-dataset-selection';
import type { A2UIAccessibility } from './a2ui-accessibility';
import { ClioScientificMap } from './a2ui-map';
import { useArtifactText } from './artifact-text-query';
import { buildZoneReference } from './data-zone-reference';
import { parseMapGeoJson } from './map-geojson';
import { parseSelectionState, type SelectionWriter } from './selection-state';
import { downloadBlob, filenameStemFromTitle } from './surface-export';
import type { SurfaceExportFormat } from './surface-toolbar';
import { artifactIdFromDataUri } from './table-query-rows';

interface GeoJsonSourceProps {
  accessibility?: A2UIAccessibility;
  action?: () => void;
  actionLabel?: string;
  categoryField?: string;
  componentId?: string;
  detailField?: string;
  geojsonUri: string;
  labelField?: string;
  selected?: string;
  selection?: unknown;
  selectionField?: string;
  setSelection?: SelectionWriter;
  title?: string;
  valueField?: string;
  valueLabel?: string;
  valueUnit?: string;
}

/** Read a registered GeoJSON artifact and present its geometry, legend, and feature selection. */
export function ClioMapGeoJsonSource({
  geojsonUri,
  labelField,
  detailField,
  categoryField,
  valueField,
  valueLabel,
  selectionField,
  selection,
  setSelection,
  title = 'Locations',
  ...rest
}: GeoJsonSourceProps) {
  const artifact = useArtifactText(geojsonUri);
  const autoSelection = useAutoDatasetSelection(geojsonUri);
  const effectiveSelectionField = selectionField ?? '__row';
  const effectiveSelection = setSelection ? selection : autoSelection.selection;
  const effectiveSetSelection = setSelection ?? autoSelection.setSelection;
  const parsed = useMemo(() => {
    if (!artifact.text) return { data: undefined, error: '' };
    try {
      return {
        data: parseMapGeoJson(artifact.text, {
          categoryField,
          detailField,
          labelField,
          selectionField: effectiveSelectionField,
          valueField,
        }),
        error: '',
      };
    } catch (error) {
      return { data: undefined, error: error instanceof Error ? error.message : String(error) };
    }
  }, [artifact.text, categoryField, detailField, labelField, effectiveSelectionField, valueField]);
  if (artifact.error || parsed.error) {
    return <p className="text-sm text-destructive" role="alert">Map unavailable: {artifact.error || parsed.error}</p>;
  }
  if (!parsed.data) {
    return <p className="text-sm text-muted-foreground" role="status">Loading {title} map…</p>;
  }
  const { collection, points, bounds } = parsed.data;
  const selectedValues = parseSelectionState(effectiveSelection)?.values;
  const selected = selectedValues?.length
    ? points.filter((point) => selectedValues.includes(point.selectionValue ?? -1))
    : [];
  const reference = () => buildZoneReference({
    componentLabel: title,
    datasetLabel: artifactIdFromDataUri(geojsonUri) ?? geojsonUri,
    filters: [],
    previewColumns: ['id', 'label', 'category', 'value'],
    previewRows: (selected.length ? selected : points).slice(0, 5).map((point) => ({
      id: point.id, label: point.label, category: point.category, value: point.value,
    })),
    query: {
      geojsonUri,
      ...(selected.length ? { selection: { field: effectiveSelectionField, values: selected.map((point) => point.selectionValue) } } : {}),
    },
    zoneDescription: selected.length
      ? `${selected.length.toLocaleString()} selected ${selected.length === 1 ? 'feature' : 'features'} of ${points.length.toLocaleString()}`
      : `the filtered current view (${points.length.toLocaleString()} features)`,
  });
  const exportFormats: SurfaceExportFormat[] = [{
    id: 'geojson',
    label: 'GeoJSON data',
    run: () => downloadBlob(new Blob([JSON.stringify(collection)], { type: 'application/geo+json' }), `${filenameStemFromTitle(title)}.geojson`),
  }];
  return <ClioScientificMap
    {...rest}
    dataCapabilities={{ buildReference: reference, exportFormats }}
    geometry={collection}
    geometryBounds={bounds}
    points={points}
    selection={effectiveSelection}
    selectionField={effectiveSelectionField}
    setSelection={effectiveSetSelection}
    title={title}
    valueLabel={valueLabel ?? valueField}
  />;
}
