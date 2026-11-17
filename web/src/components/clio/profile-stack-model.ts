import type { QueryRow } from './table-query-rows';

/** One vertical profile: its id, label and samples sorted by the vertical coordinate. */
export interface Profile {
  id: string;
  label: string;
  category?: string;
  vertical: number[];
  value: (number | null)[];
  overlay: (number | null)[];
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Rows (one per sample) grouped into profiles, each sorted by the vertical. */
export function groupProfiles(
  rows: readonly QueryRow[],
  fields: {
    profile: string;
    vertical: string;
    value: string;
    overlay?: string;
    label?: string;
    category?: string;
  },
): Profile[] {
  const byId = new Map<
    string,
    { label: string; category?: string; samples: [number, number | null, number | null][] }
  >();
  for (const row of rows) {
    const id = row[fields.profile];
    const vertical = finite(row[fields.vertical]);
    if (id === null || id === undefined || vertical === null) continue;
    const key = String(id);
    const entry = byId.get(key) ?? {
      label: fields.label && row[fields.label] != null ? String(row[fields.label]) : key,
      category:
        fields.category && row[fields.category] != null ? String(row[fields.category]) : undefined,
      samples: [],
    };
    entry.samples.push([
      vertical,
      finite(row[fields.value]),
      fields.overlay ? finite(row[fields.overlay]) : null,
    ]);
    byId.set(key, entry);
  }
  return [...byId.entries()].map(([id, entry]) => {
    const samples = entry.samples.sort((left, right) => left[0] - right[0]);
    return {
      id,
      label: entry.label,
      category: entry.category,
      vertical: samples.map((sample) => sample[0]),
      value: samples.map((sample) => sample[1]),
      overlay: samples.map((sample) => sample[2]),
    };
  });
}

/** [min, max] of the values and verticals across the profiles shown. */
export function profileExtents(
  profiles: readonly Profile[],
): { value: [number, number]; vertical: [number, number] } | undefined {
  let vmin = Infinity;
  let vmax = -Infinity;
  let zmin = Infinity;
  let zmax = -Infinity;
  for (const profile of profiles) {
    profile.vertical.forEach((z, index) => {
      for (const value of [profile.value[index], profile.overlay[index]]) {
        if (value === null || value === undefined) continue;
        vmin = Math.min(vmin, value);
        vmax = Math.max(vmax, value);
        zmin = Math.min(zmin, z);
        zmax = Math.max(zmax, z);
      }
    });
  }
  if (!Number.isFinite(vmin)) return undefined;
  if (vmin === vmax) [vmin, vmax] = [vmin - 0.5, vmax + 0.5];
  if (zmin === zmax) [zmin, zmax] = [zmin - 0.5, zmax + 0.5];
  return { value: [vmin, vmax], vertical: [zmin, zmax] };
}

/** The excluded ids as a clean, sorted list (the value written to the data model). */
export function excludedList(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.map(String))].sort() : [];
}

export function toggleExcluded(current: unknown, id: string): string[] {
  const list = excludedList(current);
  return list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id].sort();
}

/** The profile nearest a point in plot space, within `tolerance` value units. */
export function nearestProfile(
  profiles: readonly Profile[],
  value: number,
  vertical: number,
  tolerance: number,
): Profile | undefined {
  let best: Profile | undefined;
  let distance = tolerance;
  for (const profile of profiles) {
    for (let index = 0; index + 1 < profile.vertical.length; index += 1) {
      const z0 = profile.vertical[index]!;
      const z1 = profile.vertical[index + 1]!;
      if (vertical < Math.min(z0, z1) || vertical > Math.max(z0, z1)) continue;
      const v0 = profile.value[index];
      const v1 = profile.value[index + 1];
      if (v0 === null || v0 === undefined || v1 === null || v1 === undefined) continue;
      const at = z1 === z0 ? v0 : v0 + ((v1 - v0) * (vertical - z0)) / (z1 - z0);
      if (Math.abs(at - value) < distance) {
        distance = Math.abs(at - value);
        best = profile;
      }
    }
  }
  return best;
}
