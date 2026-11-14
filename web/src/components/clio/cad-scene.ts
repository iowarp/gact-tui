import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Vec3 } from './cad-parts';
import { CadOverlays } from './cad-scene-overlays';
import { CadSectionCaps } from './cad-scene-section';
import { modelParts } from './cad-view-model';
import { fitBoxDistance } from './mesh-viewport-framing';
import type { ParsedFeaMesh } from './mesh-viewport-mesh';
import type { MeshUpAxis } from './mesh-viewport-scene';
import type { MeshBounds } from './mesh-viewport-sync';

export type Projection = 'perspective' | 'orthographic';

/** How the other parts show while one is selected. */
export type PartFocus = 'normal' | 'ghost' | 'isolate';

export const UP_VECTORS: Record<MeshUpAxis, Vec3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

interface ScenePart {
  group: THREE.Group;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  edges: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  /** Feature-edge segments in the part's own (unexploded) coordinates. */
  segments: Float32Array;
}

/** A pick on a shown part: the point, its face's normal and the part's edges, all in the view. */
export interface CadPick {
  part: number;
  point: Vec3;
  normal: Vec3;
  /** The part's feature-edge segments where they are drawn (moved with an exploded part). */
  segments: Float32Array;
}

const GHOST_OPACITY = 0.14;
const FOV = 35;

/**
 * The CAD view's WebGL scene. Each part is its own object (sharing the model's vertex
 * buffers), so it can move in an exploded view, be ghosted or isolated, and be cut and capped
 * by a section plane. Renders on demand, never on a loop; the camera never animates.
 */
export class CadScene {
  public readonly overlays: CadOverlays;
  public readonly section: CadSectionCaps;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly root = new THREE.Scene();
  private readonly perspective = new THREE.PerspectiveCamera(FOV, 1, 0.01, 1e6);
  private readonly orthographic = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1e6);
  private camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = this.perspective;
  private orthoHeight = 1;
  private readonly controls: OrbitControls;
  private readonly light = new THREE.DirectionalLight(0xffffff, 1.6);
  private readonly edgeMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.7 });
  private readonly selectedEdgeMaterial = new THREE.LineBasicMaterial();
  private readonly raycaster = new THREE.Raycaster();
  private readonly resize: ResizeObserver;
  private readonly listeners = new Set<() => void>();
  private geometry?: THREE.BufferGeometry;
  private parts: ScenePart[] = [];
  private hidden: ReadonlySet<number> = new Set();
  private selected?: number;
  private focus: PartFocus = 'normal';
  private edgesShown = true;
  private frame = 0;

  public constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, stencil: true });
    this.renderer.localClippingEnabled = true;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);
    this.root.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1));
    this.light.position.set(1, 1.4, 2);
    for (const camera of [this.perspective, this.orthographic]) this.root.add(camera);
    this.perspective.add(this.light);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.addEventListener('change', () => this.requestRender());
    this.overlays = new CadOverlays(this.root);
    this.section = new CadSectionCaps(this.root);
    this.resize = new ResizeObserver(() => this.fitCanvas());
    this.resize.observe(container);
    this.fitCanvas();
  }

  /** Called after every drawn frame: labels and the axis gizmo follow the camera. */
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Show a model: one object per part, coloured by `colors` (linear RGB per vertex). */
  public setModel(data: ParsedFeaMesh, colors: Float32Array, edgeColor: string): void {
    this.clearModel();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors.slice(), 3));
    geometry.setIndex(new THREE.BufferAttribute(data.triangles, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    this.geometry = geometry;
    this.edgeMaterial.color.set(edgeColor);
    const caps: Parameters<CadSectionCaps['build']>[0] = [];
    for (const part of modelParts(data)) {
      const own = new THREE.BufferGeometry();
      for (const name of ['position', 'color', 'normal'])
        own.setAttribute(name, geometry.getAttribute(name));
      own.setIndex(
        new THREE.BufferAttribute(
          data.triangles.slice(part.triangleStart * 3, (part.triangleStart + part.triangleCount) * 3),
          1,
        ),
      );
      own.boundingSphere = geometry.boundingSphere;
      const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.62,
        metalness: 0.05,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      const mesh = new THREE.Mesh(own, material);
      mesh.renderOrder = 500;
      const outline = new THREE.EdgesGeometry(own, 35);
      const edges = new THREE.LineSegments(outline, this.edgeMaterial);
      edges.renderOrder = 501;
      edges.raycast = () => undefined;
      const group = new THREE.Group();
      group.add(mesh, edges);
      this.root.add(group);
      this.parts.push({
        group,
        mesh,
        edges,
        segments: outline.getAttribute('position').array as Float32Array,
      });
      caps.push({ group, geometry: own, color: this.partColor(part.vertexStart) });
    }
    this.section.build(caps);
    this.applyParts();
  }

  /** Recolour the parts (a theme change re-reads the palette). */
  public setColors(colors: Float32Array, firstVertices: readonly number[]): void {
    const attribute = this.geometry?.getAttribute('color') as THREE.BufferAttribute | undefined;
    if (!attribute) return;
    attribute.copyArray(colors);
    attribute.needsUpdate = true;
    this.section.setColors(firstVertices.map((vertex) => this.partColor(vertex)));
    this.requestRender();
  }

  public setEdgeColor(color: string): void {
    this.edgeMaterial.color.set(color);
    this.requestRender();
  }

  public setEdgesShown(shown: boolean): void {
    this.edgesShown = shown;
    this.applyParts();
  }

  public setHidden(hidden: ReadonlySet<number>): void {
    this.hidden = hidden;
    this.applyParts();
  }

  /** Highlight one part (or none) and choose how the others show. */
  public setSelection(selected: number | undefined, focus: PartFocus, highlight: string): void {
    this.selected = selected;
    this.focus = selected === undefined ? 'normal' : focus;
    this.selectedEdgeMaterial.color.set(highlight);
    this.parts.forEach(({ mesh }, index) =>
      mesh.material.emissive.set(index === selected ? highlight : 0x000000).multiplyScalar(0.35),
    );
    this.applyParts();
  }

  /** Move each part by its exploded-view offset. */
  public setOffsets(offsets: readonly Vec3[]): void {
    this.parts.forEach(({ group }, index) => group.position.set(...(offsets[index] ?? [0, 0, 0])));
    this.requestRender();
  }

  /** Cut the shown parts along a plane (undefined: no section), capping what is cut. */
  public setSection(section: Parameters<CadSectionCaps['update']>[0], outlineColor: string): void {
    const was = this.section.active;
    this.section.update(section, outlineColor);
    if (was !== this.section.active) {
      const planes = this.section.active ? [this.section.plane] : [];
      for (const material of [
        ...this.parts.map(({ mesh }) => mesh.material),
        this.edgeMaterial,
        this.selectedEdgeMaterial,
      ]) {
        material.clippingPlanes = planes;
        material.needsUpdate = true;
      }
    }
    this.applyParts();
  }

  public get projection(): Projection {
    return this.camera === this.orthographic ? 'orthographic' : 'perspective';
  }

  /** Switch between perspective and orthographic, keeping what is in view. */
  public setProjection(projection: Projection): void {
    if (projection === this.projection) return;
    const target = this.controls.target;
    const from = this.camera;
    if (projection === 'orthographic') {
      const distance = from.position.distanceTo(target);
      this.orthoHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
      this.orthographic.position.copy(from.position);
      this.orthographic.zoom = 1;
      this.orthographic.near = -distance * 50;
      this.orthographic.far = distance * 50;
      this.camera = this.orthographic;
    } else {
      const distance = from.position.distanceTo(target) / Math.max(1e-6, this.orthographic.zoom);
      const direction = from.position.clone().sub(target).normalize();
      this.perspective.position.copy(target).addScaledVector(direction, distance);
      this.camera = this.perspective;
    }
    this.camera.up.copy(from.up);
    this.light.removeFromParent();
    this.camera.add(this.light);
    this.controls.object = this.camera;
    this.updateProjection();
    this.controls.update();
    this.requestRender();
  }

  /**
   * Frame `bounds` looking along `-direction` (unit, from the centre towards the camera)
   * with `up` as the screen's up. The camera moves at once: there is no animation.
   */
  public frameFrom(bounds: MeshBounds, direction: THREE.Vector3, up: THREE.Vector3): void {
    const { center, distance, radius } = fitBoxDistance(
      bounds,
      direction,
      up,
      FOV,
      this.perspective.aspect,
    );
    this.perspective.near = Math.min(distance / 100, radius / 100);
    this.perspective.far = (distance + radius) * 100;
    this.orthoHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    this.orthographic.zoom = 1;
    this.orthographic.near = -(distance + radius) * 50;
    this.orthographic.far = (distance + radius) * 50;
    this.camera.up.copy(up);
    this.camera.position.copy(center).addScaledVector(direction, distance);
    this.controls.target.copy(center);
    this.updateProjection();
    this.controls.update();
    this.requestRender();
  }

  /** Frame `bounds` from an isometric direction relative to `up`. */
  public frameIsometric(bounds: MeshBounds, up: MeshUpAxis): void {
    const upVector = new THREE.Vector3(...UP_VECTORS[up]);
    const side = up === 'z' ? new THREE.Vector3(1, -1, 0) : new THREE.Vector3(1, 0, 1);
    const direction = side.normalize().multiplyScalar(0.9).add(upVector.clone().multiplyScalar(0.45));
    this.frameFrom(bounds, direction.normalize(), upVector);
  }

  /** Frame `bounds` again from where the camera looks now. */
  public fit(bounds: MeshBounds): void {
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    this.frameFrom(bounds, direction, this.camera.up.clone());
  }

  /** The camera's orientation, for the axis gizmo. */
  public viewQuaternion(): THREE.Quaternion {
    return this.camera.quaternion.clone();
  }

  /** A model point on the canvas in CSS pixels; undefined behind the camera. */
  public project(point: Vec3): [number, number] | undefined {
    const v = new THREE.Vector3(...point).project(this.camera);
    if (v.z < -1 || v.z > 1) return undefined;
    return [
      ((v.x + 1) / 2) * this.container.clientWidth,
      ((1 - v.y) / 2) * this.container.clientHeight,
    ];
  }

  /** The nearest shown, solid, uncut part under a canvas point. */
  public pick(x: number, y: number): CadPick | undefined {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return undefined;
    this.raycaster.setFromCamera(new THREE.Vector2((x / width) * 2 - 1, 1 - (y / height) * 2), this.camera);
    const candidates = this.parts.filter((_, index) => this.solid(index)).map(({ mesh }) => mesh);
    for (const hit of this.raycaster.intersectObjects(candidates, false)) {
      if (this.section.active && this.section.plane.distanceToPoint(hit.point) < 0) continue;
      const part = this.parts.findIndex(({ mesh }) => mesh === hit.object);
      if (part < 0 || !hit.face) continue;
      const offset = this.parts[part]!.group.position;
      const segments = Float32Array.from(this.parts[part]!.segments, (value, i) => value + offset.getComponent(i % 3));
      return {
        part,
        point: hit.point.toArray() as Vec3,
        normal: hit.face.normal.clone().normalize().toArray() as Vec3,
        segments,
      };
    }
    return undefined;
  }

  /** Draw now and return the canvas, so a snapshot needs no preserved drawing buffer. */
  public capture(): HTMLCanvasElement {
    this.draw();
    return this.renderer.domElement;
  }

  public requestRender(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  public dispose(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    this.controls.dispose();
    this.clearModel();
    this.section.dispose();
    this.overlays.dispose();
    this.edgeMaterial.dispose();
    this.selectedEdgeMaterial.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.listeners.clear();
  }

  /** Whether a part is drawn solid: shown, and not ghosted or isolated away. */
  private solid(index: number): boolean {
    if (this.hidden.has(index)) return false;
    return this.focus === 'normal' || index === this.selected;
  }

  private applyParts(): void {
    this.parts.forEach(({ group, mesh, edges }, index) => {
      const ghost = this.focus === 'ghost' && index !== this.selected;
      group.visible = !this.hidden.has(index) && !(this.focus === 'isolate' && index !== this.selected);
      if (mesh.material.transparent !== ghost) {
        mesh.material.transparent = ghost;
        mesh.material.depthWrite = !ghost;
        mesh.material.opacity = ghost ? GHOST_OPACITY : 1;
        mesh.material.needsUpdate = true;
      }
      edges.material = index === this.selected ? this.selectedEdgeMaterial : this.edgeMaterial;
      edges.visible = (this.edgesShown || index === this.selected) && !ghost;
    });
    this.section.setPartsShown(this.parts.map((_, index) => this.solid(index)));
    this.requestRender();
  }

  private partColor(vertex: number): THREE.Color {
    const colors = this.geometry?.getAttribute('color');
    return colors
      ? new THREE.Color(colors.getX(vertex), colors.getY(vertex), colors.getZ(vertex))
      : new THREE.Color(0.7, 0.7, 0.7);
  }

  private draw(): void {
    this.renderer.render(this.root, this.camera);
    for (const listener of this.listeners) listener();
  }

  private clearModel(): void {
    for (const { group, mesh, edges } of this.parts) {
      this.root.remove(group);
      mesh.geometry.dispose();
      mesh.material.dispose();
      edges.geometry.dispose();
    }
    this.parts = [];
    this.geometry?.dispose();
    this.geometry = undefined;
  }

  private updateProjection(): void {
    const aspect = this.perspective.aspect;
    this.orthographic.left = (-this.orthoHeight * aspect) / 2;
    this.orthographic.right = (this.orthoHeight * aspect) / 2;
    this.orthographic.top = this.orthoHeight / 2;
    this.orthographic.bottom = -this.orthoHeight / 2;
    this.orthographic.updateProjectionMatrix();
    this.perspective.updateProjectionMatrix();
  }

  private fitCanvas(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.perspective.aspect = width / height;
    this.updateProjection();
    this.requestRender();
  }
}
