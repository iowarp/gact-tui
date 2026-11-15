import * as THREE from 'three';
import type { CircleFit } from './cad-measure';
import type { Vec3 } from './cad-parts';

/** A measurement drawn in the model: its picked points, and the circle a radius found. */
export interface MeasureShape {
  id: string;
  points: Vec3[];
  circle?: CircleFit;
}

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

/** Measurement lines, drawn in model millimetres. */
export class CadOverlays {
  private readonly measures = new THREE.Group();

  public constructor(root: THREE.Scene) {
    root.add(this.measures);
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

  public dispose(): void {
    disposeChildren(this.measures);
    this.measures.removeFromParent();
  }
}
