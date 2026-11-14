import * as THREE from 'three';
import type { CircleFit } from './cad-measure';
import type { Vec3 } from './cad-parts';

/** A measurement drawn in the model: its picked points, and the circle a radius found. */
export interface MeasureShape {
  id: string;
  points: Vec3[];
  circle?: CircleFit;
}

/** The plate under the model: centre on its top, size (w × d × h) and which model axes those are. */
export interface PlateShape {
  center: Vec3;
  size: Vec3;
  axes: [number, number, number];
}

export interface OverlayColors {
  measure: string;
  plateLine: string;
  plateFill: string;
  grid: string;
}

const GRID_MM = 10;

function disposeChildren(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    const object = child as THREE.Mesh;
    object.geometry?.dispose();
    (object.material as THREE.Material | undefined)?.dispose();
  }
}

/** Lines drawn on top of the model, never hidden by it: dimensions read from any angle. */
function onTop<T extends THREE.Object3D>(object: T): T {
  object.renderOrder = 1001;
  object.raycast = () => undefined;
  return object;
}

/** Measurement lines and the print plate, drawn in model millimetres. */
export class CadOverlays {
  private readonly measures = new THREE.Group();
  private readonly plate = new THREE.Group();

  public constructor(root: THREE.Scene) {
    root.add(this.measures, this.plate);
  }

  /** Each measurement's line and end points, a radius's circle, and a pending first point. */
  public setMeasurements(shapes: readonly MeasureShape[], pending: Vec3 | undefined, color: string) {
    disposeChildren(this.measures);
    const lineMaterial = () =>
      new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 });
    const ends: number[] = [];
    for (const shape of shapes) {
      ends.push(...shape.points.flat());
      if (shape.points.length > 1) {
        const line = new THREE.BufferGeometry().setFromPoints(
          shape.points.map((p) => new THREE.Vector3(...p)),
        );
        this.measures.add(onTop(new THREE.Line(line, lineMaterial())));
      }
      if (shape.circle) {
        const { center, radius, normal } = shape.circle;
        const ring = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2).getPoints(96);
        const basis = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          new THREE.Vector3(...normal),
        );
        const points = ring.map((p) =>
          new THREE.Vector3(p.x, p.y, 0).applyQuaternion(basis).add(new THREE.Vector3(...center)),
        );
        this.measures.add(
          onTop(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), lineMaterial())),
        );
        ends.push(...center);
      }
    }
    if (pending) ends.push(...pending);
    if (ends.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(ends, 3));
      this.measures.add(
        onTop(
          new THREE.Points(
            geometry,
            new THREE.PointsMaterial({ color, size: 7, sizeAttenuation: false, depthTest: false }),
          ),
        ),
      );
    }
  }

  /** The plate's surface, outline and 10 mm grid under the model, and its build volume. */
  public setPlate(shape: PlateShape | undefined, colors: OverlayColors): void {
    disposeChildren(this.plate);
    if (!shape) return;
    const { center, size, axes } = shape;
    const [w, d, h] = size;
    // A point at (u across, v deep, z up) from the plate centre, in model axes.
    const at = (u: number, v: number, z: number) => {
      const point = new THREE.Vector3(...center);
      point.setComponent(axes[0], center[axes[0]]! + u);
      point.setComponent(axes[1], center[axes[1]]! + v);
      point.setComponent(axes[2], center[axes[2]]! + z);
      return point;
    };
    const below = -Math.max(w, d) * 1e-4;
    const corners = [
      at(-w / 2, -d / 2, below),
      at(w / 2, -d / 2, below),
      at(w / 2, d / 2, below),
      at(-w / 2, d / 2, below),
    ];
    const fill = new THREE.BufferGeometry().setFromPoints(corners);
    fill.setIndex([0, 1, 2, 0, 2, 3]);
    const surface = new THREE.Mesh(
      fill,
      new THREE.MeshBasicMaterial({
        color: colors.plateFill,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    surface.raycast = () => undefined;
    const outline = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(corners),
      new THREE.LineBasicMaterial({ color: colors.plateLine }),
    );
    const grid: THREE.Vector3[] = [];
    for (let u = -w / 2 + GRID_MM; u < w / 2 - 1e-6; u += GRID_MM)
      grid.push(at(u, -d / 2, below), at(u, d / 2, below));
    for (let v = -d / 2 + GRID_MM; v < d / 2 - 1e-6; v += GRID_MM)
      grid.push(at(-w / 2, v, below), at(w / 2, v, below));
    const lines = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(grid),
      new THREE.LineBasicMaterial({ color: colors.grid, transparent: true, opacity: 0.6 }),
    );
    // The build volume's upright edges and top, dashed: the height a print can reach.
    const top = corners.map((corner) => corner.clone().setComponent(axes[2], center[axes[2]]! + h));
    const volume: THREE.Vector3[] = [];
    for (let i = 0; i < 4; i += 1)
      volume.push(corners[i]!, top[i]!, top[i]!, top[(i + 1) % 4]!);
    const box = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(volume),
      new THREE.LineDashedMaterial({
        color: colors.plateLine,
        dashSize: Math.max(w, d) / 60,
        gapSize: Math.max(w, d) / 90,
        transparent: true,
        opacity: 0.6,
      }),
    );
    box.computeLineDistances();
    for (const object of [outline, lines, box]) object.raycast = () => undefined;
    this.plate.add(surface, lines, outline, box);
  }

  public dispose(): void {
    disposeChildren(this.measures);
    disposeChildren(this.plate);
    this.measures.removeFromParent();
    this.plate.removeFromParent();
  }
}
