import { describe, expect, it } from 'vitest';
import { axisTicks, contourLevels, contourSegments } from './field-contours';
import {
  applyEdits,
  drawnGeometry,
  frameAt,
  isoTime,
  layerFeatures,
  mapLayerSchema,
  mergeTimes,
  rowBounds,
  selectedTime,
  timeSelection,
  unionBounds,
  withEdit,
  type MapLayer,
} from './layered-map-model';
import {
  excludedList,
  groupProfiles,
  nearestProfile,
  profileExtents,
  profileRuns,
  toggleExcluded,
} from './profile-stack-model';
import { layeredMapSchema } from './a2ui-layered-map-catalog';
import { profileStackSchema } from './a2ui-profile-stack-catalog';
import { sectionSchema } from './a2ui-section-catalog';

const tracks: MapLayer = {
  id: 'ev',
  kind: 'tracks',
  label: 'Events',
  dataUri: 'artifact://artifact_t',
  latitudeField: 'lat',
  longitudeField: 'lon',
  idField: 'event',
  trackField: 'event',
  timeField: 'time',
};

describe('layered map time axis', () => {
  it('merges times from layers and picks the frame at or before the selection', () => {
    const times = mergeTimes([
      ['2022-07-02', '2022-07-01'],
      ['2022-07-01T00:00:00Z', 1656806400000],
    ]);
    expect(times.map(isoTime)).toEqual([
      '2022-07-01T00:00:00Z',
      '2022-07-02T00:00:00Z',
      '2022-07-03T00:00:00Z',
    ]);
    expect(frameAt(times, Date.parse('2022-07-02T12:00:00Z'))).toBe(times[1]);
    expect(frameAt(times, undefined)).toBe(times[2]);
    const state = timeSelection('time', times[0]!, 'map');
    expect(state).toEqual({ field: 'time', values: ['2022-07-01T00:00:00Z'], source: 'map' });
    expect(selectedTime(state)).toBe(times[0]);
  });

  it('draws each track up to the current time with its head', () => {
    const rows = [
      { event: 'A', time: '2022-07-01', lat: 10, lon: 0 },
      { event: 'A', time: '2022-07-02', lat: 11, lon: 1 },
      { event: 'A', time: '2022-07-03', lat: 12, lon: 2 },
      { event: 'B', time: '2022-07-03', lat: 0, lon: 5 },
    ];
    const at = layerFeatures(tracks, rows, Date.parse('2022-07-02T00:00:00Z'));
    const line = at.features.find((feature) => feature.geometry.type === 'LineString');
    const heads = at.features.filter((feature) => feature.properties.head);
    expect(line?.geometry.coordinates).toEqual([
      [0, 10],
      [1, 11],
    ]);
    expect(heads.map((feature) => feature.properties.id)).toEqual(['A']);
  });

  it('builds drawn geometry for each mode', () => {
    expect(drawnGeometry('point', [[1, 2]])).toEqual({ type: 'Point', coordinates: [1, 2] });
    expect(drawnGeometry('path', [[0, 0]])).toBeUndefined();
    expect(
      drawnGeometry('path', [
        [0, 0],
        [1, 1],
      ])?.type,
    ).toBe('LineString');
    const box = drawnGeometry('box', [
      [2, 3],
      [0, 1],
    ]);
    expect(box).toEqual({
      type: 'Polygon',
      coordinates: [
        [
          [0, 1],
          [2, 1],
          [2, 3],
          [0, 3],
          [0, 1],
        ],
      ],
    });
  });

  it('records one edit per moved point and applies it to the rows', () => {
    const stations: MapLayer = {
      id: 'st',
      kind: 'points',
      label: 'Stations',
      dataUri: 'artifact://artifact_s',
      latitudeField: 'lat',
      longitudeField: 'lon',
      idField: 'name',
      editable: true,
    };
    let edits = withEdit(undefined, { layer: 'st', id: 'S1', longitude: 5, latitude: 6 });
    edits = withEdit(edits, { layer: 'st', id: 'S1', longitude: 7, latitude: 8 });
    expect(edits).toEqual([{ layer: 'st', id: 'S1', longitude: 7, latitude: 8 }]);
    expect(
      applyEdits(
        stations,
        [
          { name: 'S1', lat: 0, lon: 0 },
          { name: 'S2', lat: 1, lon: 1 },
        ],
        edits,
      ),
    ).toEqual([
      { name: 'S1', lat: 8, lon: 7 },
      { name: 'S2', lat: 1, lon: 1 },
    ]);
  });

  it('refuses layers the catalog refuses', () => {
    expect(mapLayerSchema.safeParse(tracks).success).toBe(true);
    expect(mapLayerSchema.safeParse({ ...tracks, trackField: undefined }).success).toBe(false);
    expect(mapLayerSchema.safeParse({ ...tracks, editable: true }).success).toBe(false);
    expect(
      mapLayerSchema.safeParse({
        id: 'g',
        kind: 'grid',
        label: 'G',
        gridUri: 'artifact://artifact_g',
      }).success,
    ).toBe(false);
    const grid = {
      id: 'g',
      kind: 'grid',
      label: 'G',
      gridUri: 'artifact://artifact_g',
      variable: 'sst',
      colormap: 'balance',
    };
    expect(
      layeredMapSchema.safeParse({
        layers: [grid, tracks],
        time: { path: '/selection/time' },
        timeField: 'time',
      }).success,
    ).toBe(true);
    expect(layeredMapSchema.safeParse({ layers: [grid, grid] }).success).toBe(false);
    expect(
      layeredMapSchema.safeParse({ layers: [grid], time: { path: '/selection/time' } }).success,
    ).toBe(false);
  });
});

describe('section contours', () => {
  it('finds the isoline of a linear field', () => {
    const values = [
      [0, 1, 2],
      [0, 1, 2],
    ];
    const segments = contourSegments(values, 1.5);
    expect(segments).toHaveLength(1);
    expect(segments[0]![0][0]).toBeCloseTo(1.5);
    expect(
      contourSegments(
        [
          [0, null],
          [0, 1],
        ],
        0.5,
      ),
    ).toHaveLength(0);
    expect(contourLevels(0, 10, 2)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(contourLevels(0, 1, undefined).length).toBeGreaterThan(3);
    expect(axisTicks(0, 4007).map((tick) => tick.label)).toEqual([
      '0',
      '1000',
      '2000',
      '3000',
      '4000',
    ]);
    expect(axisTicks(13.5, 24.5).map((tick) => tick.label)).toEqual([
      '14',
      '16',
      '18',
      '20',
      '22',
      '24',
    ]);
    expect(axisTicks(0.1, 0.35)[0]!.label).toBe('0.10');
  });

  it('validates the section contract', () => {
    expect(
      sectionSchema.safeParse({ sectionUri: 'artifact://artifact_s', contourInterval: 0.5 })
        .success,
    ).toBe(true);
    expect(
      sectionSchema.safeParse({ sectionUri: 'artifact://artifact_s', valueRange: [2, 1] }).success,
    ).toBe(false);
  });
});

describe('profile stack', () => {
  const rows = [
    { p: 'a', z: 100, t: 10, m: 11 },
    { p: 'a', z: 0, t: 20, m: 19 },
    { p: 'b', z: 0, t: 22, m: null },
    { p: 'b', z: 100, t: 12, m: null },
  ];
  it('groups, sorts and measures profiles', () => {
    const profiles = groupProfiles(rows, { profile: 'p', vertical: 'z', value: 't', overlay: 'm' });
    expect(profiles.map((profile) => profile.id)).toEqual(['a', 'b']);
    expect(profiles[0]!.vertical).toEqual([0, 100]);
    expect(profiles[0]!.overlay).toEqual([19, 11]);
    expect(profileExtents(profiles)).toEqual({ value: [10, 22], vertical: [0, 100] });
    expect(nearestProfile(profiles, 21.9, 0, 1)?.id).toBe('b');
  });
  it('keeps exclusions as a clean list', () => {
    expect(toggleExcluded(['b'], 'a')).toEqual(['a', 'b']);
    expect(toggleExcluded(['a', 'b'], 'a')).toEqual(['b']);
    expect(excludedList('nonsense')).toEqual([]);
  });
  it('validates the profile stack contract', () => {
    const base = { profileField: 'p', verticalField: 'z', valueField: 't' };
    expect(
      profileStackSchema.safeParse({ ...base, dataUri: 'artifact://artifact_p' }).success,
    ).toBe(true);
    expect(
      profileStackSchema.safeParse({ ...base, data: rows, dataUri: 'artifact://artifact_p' })
        .success,
    ).toBe(false);
    expect(profileStackSchema.safeParse(base).success).toBe(false);
  });
});

describe('layered map extent', () => {
  it('boxes the positioned rows of a layer and skips rows without a position', () => {
    const rows = [
      { lon: -64.8, lat: 18.2, time: '2020-09-08T00:00:00Z', event: 'a' },
      { lon: -64.0, lat: 17.4, time: '2020-09-09T00:00:00Z', event: 'a' },
      { lon: null, lat: 10, time: '2020-09-10T00:00:00Z', event: 'a' },
    ];
    expect(rowBounds(tracks, rows)).toEqual([-64.8, 17.4, -64.0, 18.2]);
    expect(rowBounds(tracks, [])).toBeUndefined();
  });

  it('joins layer boxes and clamps them to the web map', () => {
    expect(unionBounds([[-64.8, 17.4, -64, 18.2], undefined, [-70, 10, -60, 20]])).toEqual([
      -70, 10, -60, 20,
    ]);
    expect(unionBounds([[-200, -90, 200, 90]])).toEqual([-180, -85, 180, 85]);
    expect(unionBounds([undefined])).toBeUndefined();
  });
});

describe('profile runs', () => {
  it('keeps a profile whose sampling coarsens with depth as one line', () => {
    const vertical = [0, 2, 4, 6, 8, 58, 108, 158];
    const values = [28, 27.9, 27.8, 27.6, 27.5, 24, 20, 17];
    expect(profileRuns(vertical, values)).toHaveLength(1);
  });
  it('breaks a profile at a missing value and across a gap in its samples', () => {
    const vertical = [0, 10, 20, 30, 40, 400, 410, 420];
    const values = [20, 19, null, 17, 16, 8, 7.5, 7];
    expect(profileRuns(vertical, values)).toEqual([
      [
        [0, 20],
        [10, 19],
      ],
      [
        [30, 17],
        [40, 16],
      ],
      [
        [400, 8],
        [410, 7.5],
        [420, 7],
      ],
    ]);
  });
});
