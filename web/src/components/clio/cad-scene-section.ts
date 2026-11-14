import * as THREE from 'three';
import type { Vec3 } from './cad-parts';

interface PartCap {
  stencil: THREE.Group;
  cap: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
}

/** The colour of a cut face: the part's own colour, a little darker, so walls read as solid. */
function capColor(color: THREE.Color): THREE.Color {
  return color.clone().multiplyScalar(0.72);
}

/**
 * Solid section caps by the stencil method: each part's back faces count up and its front
 * faces count down behind the clipping plane, so the pixels inside the cut solid are left
 * non-zero, and a plane drawn at the cut fills only those pixels in the part's colour, then
 * clears the count for the next part. A part's stencil meshes sit in its group, so they move
 * with an exploded part; the caps lie on the world plane. Render orders keep each part's
 * count and cap together, before the parts themselves are drawn.
 */
export class CadSectionCaps {
  public readonly plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  private readonly caps: PartCap[] = [];
  private readonly outline: THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private enabled = false;

  public constructor(private readonly root: THREE.Scene) {
    this.outline = new THREE.LineLoop(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ transparent: true, opacity: 0.75, depthTest: false }),
    );
    this.outline.renderOrder = 1000;
    this.outline.visible = false;
    root.add(this.outline);
  }

  /** Make the counting meshes and the cap of every part (after a new model). */
  public build(parts: { group: THREE.Group; geometry: THREE.BufferGeometry; color: THREE.Color }[]) {
    this.clear();
    parts.forEach(({ group, geometry, color }, index) => {
      const order = 1 + index * 3;
      const counting = (side: THREE.Side, op: THREE.StencilOp) => {
        const material = new THREE.MeshBasicMaterial({
          side,
          depthWrite: false,
          depthTest: false,
          colorWrite: false,
          stencilWrite: true,
          stencilFunc: THREE.AlwaysStencilFunc,
          stencilFail: op,
          stencilZFail: op,
          stencilZPass: op,
          clippingPlanes: [this.plane],
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = order;
        mesh.raycast = () => undefined;
        return mesh;
      };
      const stencil = new THREE.Group();
      stencil.add(counting(THREE.BackSide, THREE.IncrementWrapStencilOp));
      stencil.add(counting(THREE.FrontSide, THREE.DecrementWrapStencilOp));
      stencil.visible = this.enabled;
      group.add(stencil);
      const cap = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshStandardMaterial({
          color: capColor(color),
          roughness: 0.85,
          metalness: 0,
          side: THREE.DoubleSide,
          stencilWrite: true,
          stencilRef: 0,
          stencilFunc: THREE.NotEqualStencilFunc,
          stencilFail: THREE.ReplaceStencilOp,
          stencilZFail: THREE.ReplaceStencilOp,
          stencilZPass: THREE.ReplaceStencilOp,
        }),
      );
      cap.renderOrder = order + 1;
      cap.visible = this.enabled;
      cap.raycast = () => undefined;
      this.root.add(cap);
      this.caps.push({ stencil, cap });
    });
  }

  /** Recolour the caps after the part colours change (a theme change). */
  public setColors(colors: readonly THREE.Color[]): void {
    this.caps.forEach(({ cap }, index) => {
      const color = colors[index];
      if (color) cap.material.color.copy(capColor(color));
    });
  }

  /**
   * Cut along `plane` (normal and constant, three's form) with caps `size` across, centred
   * on `center`, and the outline through `corners`; undefined turns the section off.
   */
  public update(
    section: { normal: Vec3; constant: number; corners: Vec3[]; center: Vec3; size: number } | undefined,
    outlineColor: string,
  ): void {
    this.enabled = Boolean(section);
    if (section) {
      this.plane.normal.set(...section.normal);
      this.plane.constant = section.constant;
      const at = this.plane.projectPoint(new THREE.Vector3(...section.center), new THREE.Vector3());
      const facing = at.clone().sub(this.plane.normal);
      for (const { cap } of this.caps) {
        cap.position.copy(at);
        cap.scale.setScalar(section.size);
        cap.lookAt(facing);
      }
      this.outline.geometry.setFromPoints(section.corners.map((p) => new THREE.Vector3(...p)));
      this.outline.material.color.set(outlineColor);
    }
    this.outline.visible = this.enabled;
    for (const { stencil, cap } of this.caps) {
      stencil.visible = this.enabled;
      cap.visible = this.enabled;
    }
  }

  /** Show the cap only for parts drawn solid (not hidden, ghosted or isolated away). */
  public setPartsShown(shown: readonly boolean[]): void {
    this.caps.forEach(({ stencil, cap }, index) => {
      const on = this.enabled && shown[index] !== false;
      stencil.visible = on;
      cap.visible = on;
    });
  }

  public get active(): boolean {
    return this.enabled;
  }

  public dispose(): void {
    this.clear();
    this.root.remove(this.outline);
    this.outline.geometry.dispose();
    this.outline.material.dispose();
  }

  private clear(): void {
    for (const { stencil, cap } of this.caps) {
      stencil.removeFromParent();
      for (const child of stencil.children) ((child as THREE.Mesh).material as THREE.Material).dispose();
      this.root.remove(cap);
      cap.geometry.dispose();
      cap.material.dispose();
    }
    this.caps.length = 0;
  }
}
