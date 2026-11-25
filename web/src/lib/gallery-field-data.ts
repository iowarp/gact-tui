import type { ArtifactGridInfo, ArtifactSectionSample, ArtifactTileRequest } from '@clio/core/v3';
import { colormapRgb, type Colormap } from '@/theme/data-scales';

/**
 * Synthetic data for the gallery's field components: a month of a gridded
 * anomaly field (tiles drawn here), moving event tracks, 600 vertical profiles
 * with a model overlay (36 000 samples), and a 120-station section. Large on
 * purpose, so the gallery shows the components at working sizes.
 */
const DAY = 86_400_000;
const START = Date.UTC(2022, 5, 1);
const DAYS = 30;
const times = Array.from({ length: DAYS }, (_, day) =>
  new Date(START + day * DAY).toISOString().replace('.000Z', 'Z'),
);

function anomaly(lon: number, lat: number, day: number): number {
  const cx = 10 + day * 0.4;
  const cy = 38 - day * 0.1;
  const blob =
    3.2 *
    Math.exp(-(((lon - cx) / 6) ** 2 + ((lat - cy) / 3) ** 2)) *
    Math.sin((Math.PI * (day + 1)) / (DAYS + 1));
  return blob + 0.5 * Math.sin(lon / 9) * Math.cos(lat / 7) - 0.3;
}

export const galleryGridInfo: ArtifactGridInfo = {
  variable: 'sst_anomaly',
  variables: ['sst_anomaly'],
  units: '°C',
  longName: 'sea surface temperature anomaly',
  bounds: [-10, 28, 40, 48],
  shape: [80, 200],
  leading: [{ dim: 'time', count: DAYS, values: times, truncated: false }],
  range: [-3, 3],
  colormaps: ['balance', 'viridis'],
};

/** A tile of the synthetic anomaly, drawn on a canvas as the server would. */
export async function galleryTileBytes(request: ArtifactTileRequest): Promise<Uint8Array> {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(size, size);
  const n = 2 ** request.z;
  const when = typeof request.select?.time === 'string' ? Date.parse(request.select.time) : START;
  const day = Math.max(0, Math.min(DAYS - 1, Math.round((when - START) / DAY)));
  const [low, high] = [request.vmin ?? -3, request.vmax ?? 3];
  const [west, south, east, north] = galleryGridInfo.bounds;
  for (let py = 0; py < size; py += 1) {
    const lat =
      (Math.atan(Math.sinh(Math.PI * (1 - (2 * (request.y + (py + 0.5) / size)) / n))) * 180) /
      Math.PI;
    for (let px = 0; px < size; px += 1) {
      const lon = ((request.x + (px + 0.5) / size) / n) * 360 - 180;
      const offset = (py * size + px) * 4;
      if (lon < west || lon > east || lat < south || lat > north) continue;
      const [r, g, b] = colormapRgb(
        (request.colormap as Colormap) ?? 'balance',
        (anomaly(lon, lat, day) - low) / (high - low),
      );
      image.data.set([r, g, b, Math.round(255 * (request.opacity ?? 1))], offset);
    }
  }
  context.putImageData(image, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return new Uint8Array(await blob!.arrayBuffer());
}

export const galleryEventTracks = Array.from({ length: 4 }, (_, event) =>
  Array.from({ length: DAYS - event * 5 }, (_, step) => {
    const day = step + event * 3;
    return {
      event: `E${event + 1}`,
      time: times[Math.min(day, DAYS - 1)]!,
      lat: 38 - day * 0.1 + event * 2.5 - 3,
      lon: 10 + day * 0.4 - event * 6,
      intensity: Math.round((1.5 + event * 0.6 + Math.sin(step / 4)) * 100) / 100,
    };
  }),
).flat();

export const galleryStations = Array.from({ length: 9 }, (_, index) => ({
  name: `S${String(index + 1).padStart(2, '0')}`,
  lat: 36 + (index - 4) * 0.35,
  lon: 18 + (index - 4) * 0.2,
}));

export const galleryProfiles = Array.from({ length: 600 }, (_, index) => {
  const warm = index % 7 === 0 ? 1.4 : 0;
  const mld = 30 + (index % 11) * 8;
  return Array.from({ length: 60 }, (_, level) => {
    const pressure = level * 15;
    const temperature =
      14 +
      10 * Math.exp(-Math.max(0, pressure - mld) / 180) +
      warm * Math.exp(-(((pressure - 300) / 200) ** 2));
    return {
      profile: `6901${String(index).padStart(3, '0')}_001`,
      // i18n-ignore: synthetic sample data values, not interface copy
      region: index % 3 === 0 ? 'west' : index % 3 === 1 ? 'central' : 'east',
      pressure,
      CT: Math.round(temperature * 1000) / 1000,
      SA: Math.round((37.8 + 0.6 * Math.exp(-pressure / 400) + (index % 5) * 0.02) * 1000) / 1000,
      model_CT: Math.round((temperature - 0.4 + 0.2 * Math.sin(pressure / 200)) * 1000) / 1000,
    };
  });
}).flat();

/** A synthetic 120-station section (Atlantic-like, pressure down to 4000 dbar). */
export function gallerySectionSample(variable: string | undefined): ArtifactSectionSample {
  const distance = Array.from({ length: 120 }, (_, index) => index * 50);
  const levels = Array.from({ length: 300 }, (_, index) => index * 13.4);
  const salinity = variable === 'SA';
  const values = levels.map((p) =>
    distance.map((d) => {
      if (p > 3600 + 300 * Math.sin(d / 900)) return null;
      const intermediate = Math.exp(-(((p - 900) / 250) ** 2)) * (d / 6000);
      return salinity
        ? 35.0 +
            1.4 * Math.exp(-p / 600) +
            0.6 * intermediate -
            0.3 * Math.exp(-(((p - 800) / 300) ** 2)) * (1 - d / 6000)
        : 2 + 22 * Math.exp(-p / 700) * (0.6 + 0.4 * Math.cos(d / 2000)) + 3 * intermediate;
    }),
  );
  const finite = values.flat().filter((value): value is number => value !== null);
  return {
    variable: salinity ? 'SA' : 'CT',
    variables: ['CT', 'SA'],
    units: salinity ? 'g/kg' : '°C',
    vertical: 'pressure',
    verticalUnits: 'dbar',
    positiveDown: true,
    distance,
    levels,
    values,
    min: Math.min(...finite),
    max: Math.max(...finite),
    stations: distance
      .filter((_, index) => index % 4 === 0)
      .map((d, index) => ({ distance: d, profile: `6901${String(index).padStart(3, '0')}_001` })),
    path: JSON.stringify({
      type: 'LineString',
      coordinates: [
        [-25, -40],
        [-25, 60],
      ],
    }),
    latitude: distance.map((d) => -40 + d / 60),
    longitude: distance.map(() => -25),
  };
}

export const galleryFieldTables: Record<string, Record<string, string | number>[]> = {
  artifact_gallery_event_tracks: galleryEventTracks,
  artifact_gallery_stations: galleryStations,
  artifact_gallery_profiles: galleryProfiles,
};
