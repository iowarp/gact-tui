import { MapPinIcon } from 'lucide-react';
import { useMemo } from 'react';
import Map, { Marker, NavigationControl, Popup, type ViewState } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { cn } from '@/lib/utils';

export interface ScientificMapPoint {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  detail?: string;
  category?: string;
}

interface ScientificMapViewProps {
  points: readonly ScientificMapPoint[];
  selectedId?: string;
  onSelect: (pointId: string) => void;
}

const rasterStyle = {
  version: 8 as const,
  sources: {
    openStreetMap: {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'openStreetMap', type: 'raster' as const, source: 'openStreetMap' }],
};

function initialView(points: readonly ScientificMapPoint[]): Partial<ViewState> & {
  bounds?: [[number, number], [number, number]];
  fitBoundsOptions?: { padding: number; maxZoom: number };
} {
  if (points.length === 1) {
    return {
      longitude: points[0]!.longitude,
      latitude: points[0]!.latitude,
      zoom: 8,
    };
  }
  const longitudes = points.map((point) => point.longitude);
  const latitudes = points.map((point) => point.latitude);
  let west = Math.min(...longitudes);
  let east = Math.max(...longitudes);
  let south = Math.min(...latitudes);
  let north = Math.max(...latitudes);
  if (west === east) [west, east] = [west - 0.01, east + 0.01];
  if (south === north) [south, north] = [south - 0.01, north + 0.01];
  return {
    bounds: [
      [west, south],
      [east, north],
    ],
    fitBoundsOptions: { padding: 48, maxZoom: 12 },
  };
}

export function ClioScientificMapView({ points, selectedId, onSelect }: ScientificMapViewProps) {
  const viewState = useMemo(() => initialView(points), [points]);
  const selected = points.find((point) => point.id === selectedId);

  return (
    <Map
      initialViewState={viewState}
      mapStyle={rasterStyle}
      maxPitch={0}
      maxZoom={16}
      minZoom={1}
      reuseMaps
      style={{ height: '100%', width: '100%' }}
    >
      <NavigationControl position="top-right" showCompass={false} />
      {points.map((point) => (
        <Marker
          anchor="bottom"
          key={point.id}
          latitude={point.latitude}
          longitude={point.longitude}
        >
          <button
            aria-label={`Select ${point.label}`}
            aria-pressed={point.id === selectedId}
            className={cn(
              'group grid size-8 place-items-center rounded-full border bg-card text-primary shadow-md transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              point.id === selectedId &&
                'scale-110 border-primary bg-primary text-primary-foreground',
            )}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(point.id);
            }}
            type="button"
          >
            <MapPinIcon aria-hidden="true" className="size-4" />
          </button>
        </Marker>
      ))}
      {selected ? (
        <Popup
          anchor="top"
          className="clio-scientific-map-popup"
          closeButton={false}
          closeOnClick={false}
          latitude={selected.latitude}
          longitude={selected.longitude}
          maxWidth="280px"
          offset={12}
        >
          <p className="font-medium text-foreground">{selected.label}</p>
          {selected.detail ? (
            <p className="mt-1 text-xs text-muted-foreground">{selected.detail}</p>
          ) : null}
        </Popup>
      ) : null}
    </Map>
  );
}
