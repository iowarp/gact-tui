import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { turbo } from './mesh-viewport-colormap';
import {
  selectTriangles,
  vertexValue,
  type MeshSelection,
  type MeshViewState,
  type ParsedFeaMesh,
} from './mesh-viewport-mesh';
import type { MeshBounds, MeshCameraState } from './mesh-viewport-sync';

export type MeshUpAxis = 'x' | 'y' | 'z';

const NEUTRAL = new THREE.Color(0.72, 0.75, 0.79);
const UP: Record<MeshUpAxis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

export interface MeshProbe {
  value?: number;
  x: number;
  y: number;
}

/** The WebGL half of the viewport: renders on demand, never on a loop. */
export class MeshViewportScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1e6);
  private readonly controls: OrbitControls;
  private readonly material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.62,
    metalness: 0.05,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  private readonly edgeMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.18 });
  private readonly raycaster = new THREE.Raycaster();
  private readonly resize: ResizeObserver;
  private data?: ParsedFeaMesh;
  private geometry?: THREE.BufferGeometry;
  private mesh?: THREE.Mesh;
  private edges?: THREE.LineSegments;
  private selection?: MeshSelection;
  private view: MeshViewState = { frame: 0 };
  private frame = 0;
  private applyingRemote = false;
  public onCameraChange?: (state: MeshCameraState) => void;

  public constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(1, 1.4, 2);
    this.camera.add(key);
    this.scene.add(this.camera);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.addEventListener('change', () => {
      this.requestRender();
      if (!this.applyingRemote) this.onCameraChange?.(this.cameraState());
    });
    this.resize = new ResizeObserver(() => this.fitCanvas());
    this.resize.observe(container);
    this.fitCanvas();
  }

  public setMesh(data: ParsedFeaMesh, edgeColor: string): void {
    this.clearMesh();
    this.data = data;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(data.positions.length), 3),
    );
    geometry.setIndex(new THREE.BufferAttribute(data.triangles, 1));
    geometry.computeVertexNormals();
    this.geometry = geometry;
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.scene.add(this.mesh);
    // Feature edges help read a smooth surface; a cell mesh already shades each face flat.
    if (data.topology === 'surface') {
      this.edgeMaterial.color.set(edgeColor);
      this.edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 35), this.edgeMaterial);
      this.scene.add(this.edges);
    }
    this.setView(this.view);
  }

  /** Apply coloring, threshold, and frame; rebuilds the visible triangles and colors. */
  public setView(view: MeshViewState): MeshSelection | undefined {
    this.view = view;
    const data = this.data;
    const geometry = this.geometry;
    if (!data || !geometry) return undefined;
    const selection = selectTriangles(data, view);
    this.selection = selection;
    geometry.setIndex(new THREE.BufferAttribute(selection.index, 1));
    const colors = geometry.getAttribute('color') as THREE.BufferAttribute;
    const color = view.color;
    if (!color) {
      for (let v = 0; v < colors.count; v += 1) colors.setXYZ(v, NEUTRAL.r, NEUTRAL.g, NEUTRAL.b);
    } else {
      const span = color.max > color.min ? color.max - color.min : 1;
      const paint = (vertex: number, cell: number) => {
        const [r, g, b] = turbo(
          (vertexValue(data, color.field, view.frame, vertex, cell) - color.min) / span,
        );
        colors.setXYZ(vertex, r, g, b);
      };
      if (color.field.location === 'cell') {
        // Cell faces own their corners, so each visible triangle paints its own vertices.
        for (let t = 0; t < selection.triangleCell.length; t += 1) {
          const cell = selection.triangleCell[t]!;
          for (let k = 0; k < 3; k += 1) paint(selection.index[t * 3 + k]!, cell);
        }
      } else {
        for (let v = 0; v < colors.count; v += 1) paint(v, -1);
      }
    }
    colors.needsUpdate = true;
    // Feature edges belong to the whole surface; hide them while a threshold cuts it.
    if (this.edges) this.edges.visible = !view.threshold;
    this.requestRender();
    return selection;
  }

  /** Frame `bounds` from an isometric direction relative to `up`. */
  public frameBounds(bounds: MeshBounds, up: MeshUpAxis): void {
    const box = new THREE.Box3(new THREE.Vector3(...bounds.min), new THREE.Vector3(...bounds.max));
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1e-6);
    const upVector = UP[up];
    const side = up === 'z' ? new THREE.Vector3(1, -1, 0) : new THREE.Vector3(1, 0, 1);
    const direction = side
      .normalize()
      .multiplyScalar(0.9)
      .add(upVector.clone().multiplyScalar(0.45));
    const distance = radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.camera.up.copy(upVector);
    this.camera.near = distance / 100;
    this.camera.far = distance * 100;
    this.camera.position.copy(center).addScaledVector(direction.normalize(), distance);
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(center);
    // Programmatic framing is not a user move, so it is not reported as one.
    this.applyingRemote = true;
    try {
      this.controls.update();
    } finally {
      this.applyingRemote = false;
    }
    this.requestRender();
  }

  public cameraState(): MeshCameraState {
    return {
      position: this.camera.position.toArray(),
      target: this.controls.target.toArray(),
      up: this.camera.up.toArray(),
      fov: this.camera.fov,
      zoom: this.camera.zoom,
    };
  }

  public applyCamera(state: MeshCameraState): void {
    this.applyingRemote = true;
    try {
      this.camera.position.fromArray(state.position);
      this.controls.target.fromArray(state.target);
      if (state.up) this.camera.up.fromArray(state.up);
      if (state.fov) this.camera.fov = state.fov;
      this.camera.zoom = state.zoom ?? 1;
      this.camera.updateProjectionMatrix();
      this.controls.update();
    } finally {
      this.applyingRemote = false;
    }
  }

  /** Field value under a canvas-relative point, interpolated inside the hit triangle. */
  public probe(x: number, y: number, field = this.view.color?.field): MeshProbe | undefined {
    const data = this.data;
    const selection = this.selection;
    if (!this.mesh || !data || !selection) return undefined;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return undefined;
    const pointer = new THREE.Vector2((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.mesh, false)[0];
    if (!hit?.face || hit.faceIndex === undefined || hit.faceIndex === null) return undefined;
    if (!field) return { x, y };
    const cell = selection.triangleCell[hit.faceIndex] ?? -1;
    const frame = this.view.frame;
    const at = (v: number) => vertexValue(data, field, frame, v, cell);
    if (field.location === 'cell') return { value: at(hit.face.a), x, y };
    const { a, b, c } = hit.face;
    const bary = hit.barycoord;
    const value = bary ? at(a) * bary.x + at(b) * bary.y + at(c) * bary.z : at(a);
    return { value, x, y };
  }

  /** Draw now and return the canvas, so a snapshot needs no preserved drawing buffer. */
  public capture(): HTMLCanvasElement {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement;
  }

  public requestRender(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.renderer.render(this.scene, this.camera);
    });
  }

  public dispose(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    this.controls.dispose();
    this.clearMesh();
    this.material.dispose();
    this.edgeMaterial.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private clearMesh(): void {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh = undefined;
    }
    this.geometry?.dispose();
    this.geometry = undefined;
    if (this.edges) {
      this.scene.remove(this.edges);
      this.edges.geometry.dispose();
      this.edges = undefined;
    }
  }

  private fitCanvas(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }
}
