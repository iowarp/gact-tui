/** Fictional Atlantic tracks for the standalone component gallery. */
export const galleryStormTracks = [
  { storm: 'Aster', start: [-61, 13], drift: [2.7, 2.1] },
  { storm: 'Boreal', start: [-48, 16], drift: [2.2, 1.7] },
  { storm: 'Cora', start: [-72, 11], drift: [2.9, 1.3] },
].flatMap(({ storm, start, drift }, group) =>
  Array.from({ length: 9 }, (_, index) => ({
    observation_id: `${storm.toLowerCase()}-${index + 1}`,
    storm,
    label: `${storm}, day ${index + 1}`,
    time: `${2024 + group}-09-${String(index + 1).padStart(2, '0')}T12:00:00Z`,
    wind_kt: 35 + group * 10 + index * 5,
    lat: Number((start[1]! + drift[1]! * index + Math.sin(index / 2 + group) * 0.7).toFixed(2)),
    lon: Number((start[0]! + drift[0]! * index + Math.sin(index + group) * 0.8).toFixed(2)),
  })),
);
