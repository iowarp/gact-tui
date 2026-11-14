import { ph, t } from '@lingui/core/macro';
import data from './cad-plates.json';
import { formatLength, type LengthUnit } from './cad-units';
import type { Vec3 } from './cad-parts';
import type { MeshUpAxis } from './mesh-viewport-scene';
import type { MeshBounds } from './mesh-viewport-sync';

/** A printer's build volume: width (x) × depth (y) × height, in millimetres. */
export interface PrinterPlate {
  id: string;
  name: string;
  size: Vec3;
}

export const PRINTER_PLATES: readonly PrinterPlate[] = data.plates.map((plate) => ({
  id: plate.id,
  name: plate.name,
  size: [plate.size[0]!, plate.size[1]!, plate.size[2]!],
}));

/** The person's plate: one of the list, or their own volume. */
export type PlateChoice = { kind: 'preset'; id: string } | { kind: 'custom'; size: Vec3 };

export const DEFAULT_PLATE: PlateChoice = { kind: 'preset', id: PRINTER_PLATES[0]!.id };

/** The volume a choice stands for, and the printer's name when it is one of the list. */
export function plateOf(choice: PlateChoice): { name?: string; size: Vec3 } {
  if (choice.kind === 'custom') return { size: choice.size };
  const plate = PRINTER_PLATES.find((item) => item.id === choice.id) ?? PRINTER_PLATES[0]!;
  return { name: plate.name, size: plate.size };
}

/** The model's indices across the plate (width, depth) and up from it, for its up axis. */
export function plateAxes(up: MeshUpAxis): [number, number, number] {
  return up === 'y' ? [0, 2, 1] : up === 'x' ? [1, 2, 0] : [0, 1, 2];
}

/** A model box's extent as width × depth × height on the plate. */
export function footprint(size: Vec3, up: MeshUpAxis): Vec3 {
  const [w, d, h] = plateAxes(up);
  return [size[w]!, size[d]!, size[h]!];
}

export interface PlateFit {
  /** Fits as it stands. */
  fits: boolean;
  /** Does not fit as it stands, but does when turned 90° on the plate. */
  turned: boolean;
  /** How far the model passes the volume along width, depth and height (0 where it fits). */
  over: Vec3;
}

const EPSILON = 1e-6;

/** Whether a model of `model` (w × d × h) fits a plate of `plate`, standing as it is modelled. */
export function plateFit(model: Vec3, plate: Vec3): PlateFit {
  const over = model.map((value, axis) => Math.max(0, value - plate[axis]!)) as Vec3;
  const fits = over.every((value) => value <= EPSILON);
  const turned =
    !fits &&
    model[0] <= plate[1] + EPSILON &&
    model[1] <= plate[0] + EPSILON &&
    model[2] <= plate[2] + EPSILON;
  return { fits, turned, over: over.map((value) => (value <= EPSILON ? 0 : value)) as Vec3 };
}

/** The fit in words: "Fits the Bambu Lab A1 plate", "Too tall by 12.0 mm". */
export function plateVerdict(fit: PlateFit, name: string | undefined, unit: LengthUnit): string {
  if (fit.fits) return name ? t`Fits the ${ph({ name })} plate` : t`Fits the custom plate`;
  if (fit.turned)
    return name
      ? t`Fits the ${ph({ name })} plate when turned 90°`
      : t`Fits the custom plate when turned 90°`;
  const reasons: string[] = [];
  const [wide, deep, tall] = fit.over.map((value) => formatLength(value, unit, 'size'));
  if (fit.over[0] > 0) reasons.push(t`Too wide by ${ph({ length: wide })}`);
  if (fit.over[1] > 0) reasons.push(t`Too deep by ${ph({ length: deep })}`);
  if (fit.over[2] > 0) reasons.push(t`Too tall by ${ph({ length: tall })}`);
  return reasons.join('; ');
}

/**
 * Where the plate sits: centred under the model's footprint, level with its lowest point.
 * Returns the plate centre in model coordinates.
 */
export function plateCenter(bounds: MeshBounds, up: MeshUpAxis): Vec3 {
  const [w, d, h] = plateAxes(up);
  const center: Vec3 = [0, 0, 0];
  center[w] = (bounds.min[w]! + bounds.max[w]!) / 2;
  center[d] = (bounds.min[d]! + bounds.max[d]!) / 2;
  center[h] = bounds.min[h]!;
  return center;
}

/** The build volume's box in model coordinates, for a plate centred at `center`. */
export function plateBounds(center: Vec3, size: Vec3, up: MeshUpAxis): MeshBounds {
  const axes = plateAxes(up);
  const min: Vec3 = [...center];
  const max: Vec3 = [...center];
  for (let k = 0; k < 2; k += 1) {
    min[axes[k]!] = center[axes[k]!]! - size[k]! / 2;
    max[axes[k]!] = center[axes[k]!]! + size[k]! / 2;
  }
  max[axes[2]] = center[axes[2]]! + size[2];
  return { min, max };
}

const STORAGE_KEY = 'clio.cad.plate';

/** A stored choice, or undefined when it is missing or not one this view understands. */
export function parsePlateChoice(raw: string | null | undefined): PlateChoice | undefined {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as Partial<{ kind: string; id: string; size: unknown }>;
    if (value.kind === 'preset' && PRINTER_PLATES.some((plate) => plate.id === value.id))
      return { kind: 'preset', id: value.id! };
    if (
      value.kind === 'custom' &&
      Array.isArray(value.size) &&
      value.size.length === 3 &&
      value.size.every((side) => typeof side === 'number' && side > 0 && side < 100_000)
    )
      return { kind: 'custom', size: value.size as Vec3 };
  } catch {
    return undefined;
  }
  return undefined;
}

/** The last plate this browser chose; storage may be unavailable, which reads as none. */
export function readPlateChoice(): PlateChoice {
  try {
    return parsePlateChoice(window.localStorage.getItem(STORAGE_KEY)) ?? DEFAULT_PLATE;
  } catch {
    return DEFAULT_PLATE;
  }
}

/** Remember the choice for the next model; a browser that refuses storage just forgets. */
export function savePlateChoice(choice: PlateChoice): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
  } catch {
    // Private windows and blocked storage keep the choice for this view only.
  }
}
