import { describe, expect, it, vi } from 'vitest';

// jsdom has no theme stylesheet: name each colour by its token so slots can be compared.
vi.mock('@/theme/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/theme/runtime')>()),
  readThemeColor: (token: string) => `colour(${token})`,
}));
import { colourShapes } from './layered-map-shapes';
import type { MapLayer } from './layered-map-model';

const square = (props: Record<string, unknown>) => ({
  type: 'Feature',
  properties: props,
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ],
    ],
  },
});

describe('colourShapes', () => {
  it('colours features by their category, so habitat types differ', () => {
    const layer = {
      id: 'habitat',
      kind: 'shapes',
      label: 'Habitat',
      categoryField: 'habitat',
    } as MapLayer;
    const out = colourShapes(
      {
        type: 'FeatureCollection',
        features: [
          square({ habitat: 'owl' }),
          square({ habitat: 'deer' }),
          square({ habitat: 'owl' }),
        ],
      },
      layer,
    ) as { features: { properties: Record<string, string> }[] };
    const colours = out.features.map((f) => f.properties.__clio_colour);
    expect(colours[0]).toBe(colours[2]);
    expect(colours[0]).not.toBe(colours[1]);
    expect(out.features[0]!.properties.habitat).toBe('owl');
  });

  it('gives each shapes layer without categories its own colour', () => {
    const fc = { type: 'FeatureCollection', features: [square({})] };
    const a = colourShapes(fc, { id: 'basin', kind: 'shapes', label: 'Basin' } as MapLayer) as {
      features: { properties: Record<string, string> }[];
    };
    const b = colourShapes(fc, { id: 'usfws', kind: 'shapes', label: 'USFWS' } as MapLayer) as {
      features: { properties: Record<string, string> }[];
    };
    expect(a.features[0]!.properties.__clio_colour).not.toBe(
      b.features[0]!.properties.__clio_colour,
    );
  });

  it('leaves what is not GeoJSON alone', () => {
    expect(
      colourShapes(undefined, { id: 'x', kind: 'shapes', label: 'x' } as MapLayer),
    ).toBeUndefined();
  });
});
