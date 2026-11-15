import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { binaryStl } from './cad-export';
import { cadFormatOf } from './cad-file-format';
import {
  boxSize,
  modelParts,
  partColors,
  shownBounds,
  standardViewFrame,
  upAxisOf,
} from './cad-view-model';
import { parseMeshArtifact } from './mesh-viewport-formats';
import { selectTriangles } from './mesh-viewport-mesh';

// Under Vite a `?url` import is the served path; in node the reader loads the file itself.
vi.mock('occt-import-js/dist/occt-import-js.wasm?url', () => ({
  default: resolve(process.cwd(), 'node_modules/occt-import-js/dist/occt-import-js.wasm'),
}));

const fixture = (name: string) =>
  new Uint8Array(readFileSync(resolve(process.cwd(), 'src/test-fixtures/cad', name)));
const text = (source: string) => new TextEncoder().encode(source);

const ASCII_STL = `solid wedge
facet normal 0 0 -1
outer loop
vertex 0 0 0
vertex 0 4 0
vertex 8 0 0
endloop
endfacet
facet normal 0 0 1
outer loop
vertex 0 0 2
vertex 8 0 2
vertex 0 4 2
endloop
endfacet
endsolid wedge
`;

describe('3D file formats by name', () => {
  it.each([
    ['assembly/whistle.STEP', 'step'],
    ['whistle.stp', 'step'],
    ['body.stl', 'stl'],
    ['plate.3mf', '3mf'],
    ['scan.obj', 'obj'],
    ['scene.glb', 'glb'],
  ])('%s opens as %s', (path, format) => expect(cadFormatOf(path)).toBe(format));

  it.each(['notes.txt', 'stl', 'step/readme', 'model.step.txt'])('%s is not a 3D file', (path) =>
    expect(cadFormatOf(path)).toBeUndefined(),
  );
});

describe('STL', () => {
  it('reads a binary STL from CadQuery, recognised without a hint', async () => {
    const mesh = await parseMeshArtifact(fixture('block-binary.stl'));
    expect(mesh.sourceFormat).toBe('stl');
    expect(mesh.triangles.length / 3).toBe(12);
    expect(boxSize(mesh.bounds)).toEqual(['20.0', '12.0', '6.0']);
    expect(modelParts(mesh)).toHaveLength(1);
    expect(modelParts(mesh)[0]!.color).toBeUndefined();
  });

  it('reads an ASCII STL', async () => {
    const mesh = await parseMeshArtifact(text(ASCII_STL), 'stl');
    expect(mesh.triangles.length / 3).toBe(2);
    expect(boxSize(mesh.bounds)).toEqual(['8.0', '4.0', '2.0']);
  });

  it('writes a binary STL that reads back to the same triangles and box', async () => {
    const mesh = await parseMeshArtifact(text(ASCII_STL), 'stl');
    const written = binaryStl(mesh, 'wedge');
    expect(written.byteLength).toBe(84 + 2 * 50);
    expect(new TextDecoder().decode(written.subarray(0, 5))).not.toBe('solid');
    const again = await parseMeshArtifact(written);
    expect(again.sourceFormat).toBe('stl');
    expect(again.bounds).toEqual(mesh.bounds);
    // The first facet's normal faces down, as its winding says.
    const normal = new DataView(written.buffer, 84, 12);
    expect(normal.getFloat32(8, true)).toBeCloseTo(-1);
  });
});

describe('STEP', () => {
  it('reads a two-part assembly with its part names, colours and size in millimetres', async () => {
    const mesh = await parseMeshArtifact(fixture('two-part.step'));
    expect(mesh.sourceFormat).toBe('step');
    const parts = modelParts(mesh);
    expect(parts.map((part) => part.name)).toEqual(['base', 'peg']);
    // CadQuery's colours: a blue base and an orange peg.
    expect(parts[0]!.color![2]).toBeGreaterThan(parts[0]!.color![0]);
    expect(parts[1]!.color![0]).toBeGreaterThan(parts[1]!.color![2]);
    expect(boxSize(mesh.bounds)).toEqual(['20.0', '12.0', '16.0']);
    expect(upAxisOf('step')).toBe('z');

    const hidden = new Set([1]);
    expect(selectTriangles(mesh, { frame: 0, hiddenParts: hidden }).index.length / 3).toBe(
      parts[0]!.triangleCount,
    );
    expect(boxSize(shownBounds(mesh, hidden)!)).toEqual(['20.0', '12.0', '6.0']);
    expect(shownBounds(mesh, new Set([0, 1]))).toBeUndefined();
  }, 30_000);

  it('refuses a file that is not STEP with a typed reason', async () => {
    await expect(
      parseMeshArtifact(text('ISO-10303-21;\nnot a model'), 'step'),
    ).rejects.toMatchObject({ code: expect.stringMatching(/^cad_step_/u) });
  }, 30_000);
});

describe('view model', () => {
  it('keeps declared part colours and gives the rest the palette in order', async () => {
    const mesh = await parseMeshArtifact(text(ASCII_STL), 'stl');
    const colors = partColors(mesh, [[0.1, 0.2, 0.3]]);
    expect(Array.from(colors.subarray(0, 3))).toEqual([0.1, 0.2, 0.3].map(Math.fround));
  });

  it('looks at the top from above and the front from -Y on a Z-up model', () => {
    expect(standardViewFrame('top', 'z').direction).toEqual([0, 0, 1]);
    expect(standardViewFrame('front', 'z')).toEqual({ direction: [0, -1, 0], up: [0, 0, 1] });
    expect(standardViewFrame('front', 'y').direction).toEqual([0, 0, 1]);
  });
});
