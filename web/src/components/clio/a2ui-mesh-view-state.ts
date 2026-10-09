import { formatFieldValue } from './mesh-viewport-colormap';
import type { MeshField, ParsedFeaMesh } from './mesh-viewport-mesh';
import type { MeshCameraState } from './mesh-viewport-sync';

export interface ViewInputs {
  color?: MeshField;
  threshold?: { field: MeshField; min: number; max: number };
  frame: number;
}

export function artifactIdFromMeshUri(uri: string): string | undefined {
  return /^artifact:\/\/(artifact_[A-Za-z0-9_-]+)$/u.exec(uri)?.[1];
}

export function isCameraState(value: unknown): value is MeshCameraState {
  if (!value || typeof value !== 'object') return false;
  const { position, target } = value as Partial<MeshCameraState>;
  const vector = (v: unknown) =>
    Array.isArray(v) &&
    v.length === 3 &&
    v.every((n) => typeof n === 'number' && Number.isFinite(n));
  return vector(position) && vector(target);
}

export function describe(
  parsed: ParsedFeaMesh | undefined,
  frame: number,
  inputs: ViewInputs,
  visibleCells: number | undefined,
  artifactId: string | undefined,
): string {
  if (!parsed) return artifactId ? 'Loading mesh…' : 'Mesh unavailable';
  const parts: string[] = [];
  if (parsed.frames.length > 1) parts.push(parsed.frames[frame] ?? `Frame ${frame}`);
  const threshold = inputs.threshold;
  if (threshold && threshold.field.location === 'cell' && visibleCells !== undefined) {
    const bound = Number.isFinite(threshold.min)
      ? ` at ${threshold.field.label.toLowerCase()} ≥ ${formatFieldValue(threshold.min)}${threshold.field.unit ? ` ${threshold.field.unit}` : ''}`
      : '';
    parts.push(
      `${visibleCells.toLocaleString()} of ${parsed.cells.toLocaleString()} elements${bound}`,
    );
  } else if (parsed.topology === 'cells') {
    parts.push(`${parsed.cells.toLocaleString()} elements`);
  } else {
    parts.push(`${(parsed.triangles.length / 3).toLocaleString()} surface triangles`);
  }
  if (parsed.lengthUnit) parts.push(`units ${parsed.lengthUnit}`);
  return parts.join(', ');
}

export function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-|-$/gu, '') || 'view'
  );
}

/** Feature-edge color; three.js cannot parse the theme's oklch() tokens. */
export function edgeColorForTheme(): string {
  return document.documentElement.classList.contains('dark') ? '#cbd5e1' : '#1e293b';
}

export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export function rangeOf(field: MeshField | undefined) {
  return field ? { field: field.name, min: field.min, max: field.max } : undefined;
}
