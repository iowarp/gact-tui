import type { Measurement } from './cad-measure-state';
import type { PartFacts, Vec3 } from './cad-parts';
import type { PartFocus, Projection } from './cad-scene';
import type { SectionState } from './cad-section';
import { formatNumber, type LengthUnit } from './cad-units';
import type { MeshUpAxis } from './mesh-viewport-scene';

/**
 * What the 3D file view shows, as lines the agent reads with a look or a region comment
 * (FV-D2): the model, the camera, the section, the exploded view, the parts shown and
 * selected, and the measurements on screen. The lines travel to the agent, so they stay
 * in English whatever the interface language (i18n-ignore on each), and numbers use the
 * view's own unit with the precision its labels show.
 */

export interface CadViewStateInput {
  name: string;
  up: MeshUpAxis;
  unit: LengthUnit;
  projection: Projection;
  /** The unit direction from the view's centre towards the camera. */
  viewDirection: Vec3;
  facts: readonly PartFacts[];
  hidden: ReadonlySet<number>;
  /** The shown parts' size as modelled (not exploded). */
  size: Vec3;
  section?: SectionState;
  /** The exploded view's amount, 0 to 1. */
  explode: number;
  selected?: number;
  focus: PartFocus;
  measurements: readonly Measurement[];
  /** A distance or angle whose first pick is placed. */
  measuring?: boolean;
}

const AXES = ['X', 'Y', 'Z'] as const;

function unitWord(unit: LengthUnit): string {
  return unit === 'in' ? 'in' : 'mm';
}

function length(mm: number, unit: LengthUnit, precision: 'size' | 'measure' = 'measure'): string {
  return `${formatNumber(mm, unit, precision)} ${unitWord(unit)}`;
}

function box(size: Vec3, unit: LengthUnit): string {
  const [x, y, z] = size.map((value) => formatNumber(value, unit, 'size'));
  return `${x} × ${y} × ${z} ${unitWord(unit)}`;
}

function signed(value: number, axis: number): string {
  return `${value < 0 ? '−' : '+'}${AXES[axis]}`;
}

/** The standard views by where the camera sits, for a Z-up or Y-up model. */
function namedViews(up: MeshUpAxis): [string, Vec3][] {
  const z = up === 'z';
  return [
    ['the top', z ? [0, 0, 1] : [0, 1, 0]],
    ['the bottom', z ? [0, 0, -1] : [0, -1, 0]],
    ['the front', z ? [0, -1, 0] : [0, 0, 1]],
    ['the back', z ? [0, 1, 0] : [0, 0, -1]],
    ['the right', [1, 0, 0]],
    ['the left', [-1, 0, 0]],
  ];
}

/** Where the camera looks from, in words: a standard view, or the axes it sits between. */
export function cameraWords(direction: Vec3, up: MeshUpAxis): string {
  const norm = Math.hypot(...direction) || 1;
  const unit = direction.map((value) => value / norm) as Vec3;
  for (const [name, axis] of namedViews(up)) {
    const dot = unit[0] * axis[0] + unit[1] * axis[1] + unit[2] * axis[2];
    if (dot > Math.cos((5 * Math.PI) / 180)) {
      const index = axis.findIndex((value) => value !== 0);
      // i18n-ignore: view state the agent reads, kept in English
      return `looking from ${name} (camera on the ${signed(axis[index]!, index)} side)`;
    }
  }
  const sides = unit
    .map((value, axis) => (Math.abs(value) > 0.2 ? signed(value, axis) : ''))
    .filter(Boolean);
  const vector = unit.map((value) => value.toFixed(2)).join(', ');
  // i18n-ignore: view state the agent reads, kept in English
  return `looking from between ${sides.join(', ')} (direction to camera ${vector})`;
}

function partName(facts: readonly PartFacts[], index: number): string {
  // i18n-ignore: view state the agent reads, kept in English
  return facts[index]?.name || `part ${index + 1}`;
}

function measurementLine(item: Measurement, index: number, input: CadViewStateInput): string {
  const { unit, facts } = input;
  const on = [...new Set(item.parts.map((part) => partName(facts, part)))].join(' and ');
  const where = facts.length > 1 && on ? `, on ${on}` : '';
  if (item.circle) {
    const diameter = length(item.circle.radius * 2, unit);
    const radius = length(item.circle.radius, unit);
    // i18n-ignore: view state the agent reads, kept in English
    return `Measurement ${index + 1}: round edge, diameter ${diameter} (radius ${radius})${where}`;
  }
  if (item.angle !== undefined)
    // i18n-ignore: view state the agent reads, kept in English
    return `Measurement ${index + 1}: angle ${item.angle.toFixed(1)}° between two faces${where}`;
  const distance = item.distance;
  const [dx, dy, dz] = (distance?.delta ?? [0, 0, 0]).map((value) => formatNumber(value, unit));
  const ends = item.snaps.join(' to ');
  return (
    // i18n-ignore: view state the agent reads, kept in English
    `Measurement ${index + 1}: distance ${length(distance?.distance ?? 0, unit)} ` +
    // i18n-ignore: view state the agent reads, kept in English
    `(ΔX ${dx}, ΔY ${dy}, ΔZ ${dz}), ${ends}${where}`
  );
}

/** The view state as readable English lines. */
export function cadViewState(input: CadViewStateInput): string[] {
  const { facts, hidden, unit } = input;
  const lines: string[] = [];
  const names = facts.map((_, index) => partName(facts, index));
  const parts =
    // i18n-ignore: view state the agent reads, kept in English
    facts.length > 1 ? `${facts.length} parts (${names.join(', ')})` : 'one part';
  lines.push(
    // i18n-ignore: view state the agent reads, kept in English
    `Model: ${input.name}, ${parts}; ${input.up.toUpperCase()} is up; ` +
      // i18n-ignore: view state the agent reads, kept in English
      `lengths in ${unit === 'in' ? 'inches' : 'millimetres'}`,
  );
  // i18n-ignore: view state the agent reads, kept in English
  lines.push(`Size of the shown parts, as modelled: ${box(input.size, unit)}`);
  lines.push(
    // i18n-ignore: view state the agent reads, kept in English
    `Camera: ${cameraWords(input.viewDirection, input.up)}, ${input.projection} projection`,
  );
  const section = input.section;
  if (section) {
    const axis = section.axis.toUpperCase();
    // i18n-ignore: view state the agent reads, kept in English
    const side = section.flipped ? `above (+${axis})` : `below (−${axis})`;
    lines.push(
      // i18n-ignore: view state the agent reads, kept in English
      `Section: plane across ${axis} at ${axis} = ${length(section.position, unit, 'size')}, ` +
        // i18n-ignore: view state the agent reads, kept in English
        `keeping the side ${side}; cut faces are filled solid`,
    );
  // i18n-ignore: view state the agent reads, kept in English
  } else lines.push('Section: none');
  lines.push(
    input.explode > 0.001
      // i18n-ignore: view state the agent reads, kept in English
      ? `Exploded view: ${Math.round(input.explode * 100)} % (parts moved apart; ` +
          'measurements and sizes are as modelled)'
      // i18n-ignore: view state the agent reads, kept in English
      : 'Exploded view: off (parts assembled)',
  );
  if (facts.length > 1) {
    const shown = names.filter((_, index) => !hidden.has(index));
    const off = names.filter((_, index) => hidden.has(index));
    lines.push(
      off.length
        // i18n-ignore: view state the agent reads, kept in English
        ? `Visible parts: ${shown.join(', ') || 'none'}; hidden: ${off.join(', ')}`
        // i18n-ignore: view state the agent reads, kept in English
        : `Visible parts: all (${shown.join(', ')})`,
    );
  }
  const selected = input.selected !== undefined ? facts[input.selected] : undefined;
  if (selected) {
    const others =
      input.focus === 'ghost'
        ? '; the other parts are ghosted'
        : input.focus === 'isolate'
          ? '; the other parts are hidden (isolated)'
          : '';
    lines.push(
      // i18n-ignore: view state the agent reads, kept in English
      `Selected part: ${partName(facts, selected.index)}, ${box(selected.size, unit)}, ` +
        // i18n-ignore: view state the agent reads, kept in English
        `${selected.triangles} triangles${others}`,
    );
  // i18n-ignore: view state the agent reads, kept in English
  } else lines.push('Selected part: none');
  input.measurements.forEach((item, index) => lines.push(measurementLine(item, index, input)));
  // i18n-ignore: view state the agent reads, kept in English
  if (!input.measurements.length) lines.push('Measurements: none');
  // i18n-ignore: view state the agent reads, kept in English
  if (input.measuring) lines.push('Measuring: a first point is placed, the second is not');
  return lines;
}
