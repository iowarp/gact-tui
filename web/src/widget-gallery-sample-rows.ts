/** Deterministic sample rows the widget gallery's charts, maps and tables share. */

export function sampleFraction(index: number, salt: number): number {
  let value = Math.imul(index + 1, 0x9e3779b1) ^ salt;
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  return (value >>> 0) / 0x100000000;
}

export const chartRows = Array.from({ length: 90 }, (_, index) => ({
  __row: index,
  id: `eq${String(index + 1).padStart(3, '0')}`,
  depth: Number((1 + sampleFraction(index, 17) * 32).toFixed(2)),
  magnitude: Number((1.05 + sampleFraction(index, 47) * 3.9).toFixed(2)),
  region: ['Coast', 'Valley', 'Range'][index % 3],
}));
export const heatmapRows = ['Coast', 'Valley', 'Range'].flatMap((region, regionIndex) =>
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, dayIndex) => ({
    __row: regionIndex * 6 + dayIndex,
    id: `${region}-${day}`,
    region,
    day,
    events: 4 + ((regionIndex * 7 + dayIndex * 11) % 21),
  })),
);
export const trajectoryRows = ['Coast', 'Valley', 'Range'].flatMap((region, regionIndex) =>
  Array.from({ length: 18 }, (_, index) => ({
    __row: regionIndex * 18 + index,
    id: region,
    region,
    day: index + 1,
    displacement: Number(
      (
        regionIndex * 1.5 +
        index * (0.13 + regionIndex * 0.03) +
        Math.sin(index / 2 + regionIndex) * 0.4
      ).toFixed(2),
    ),
  })),
);
export const spectrumRows = ['Sample A', 'Sample B', 'Sample C'].flatMap((sample, sampleIndex) =>
  Array.from({ length: 55 }, (_, index) => {
    const wavelength = 400 + index * 6;
    const peak = 490 + sampleIndex * 72;
    return {
      __row: sampleIndex * 55 + index,
      id: sample,
      sample,
      wavelength,
      intensity: Number(
        (0.12 + (1 + sampleIndex * 0.18) * Math.exp(-(((wavelength - peak) / 48) ** 2))).toFixed(3),
      ),
    };
  }),
);
export const linkedRows = Array.from({ length: 12 }, (_, index) => ({
  id: `site-${index + 1}`,
  // i18n-ignore: synthetic sample dataset values, standing in for agent-produced data
  site: `Site ${index + 1}`,
  depth: 2 + index * 1.7,
  magnitude: 1.2 + ((index * 7) % 25) / 10,
  latitude: 36 + index * 0.32,
  longitude: -123 + index * 0.4,
  region: index % 2 ? 'Range' : 'Coast',
}));
