import { describe, expect, it } from 'vitest';
import { MeshFormatError, parseMeshArtifact, type MeshFormat } from './mesh-viewport-formats';

const triangle = {
  obj: 'o Triangle\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n',
  stl: 'solid Triangle\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid Triangle\n',
  ply: 'ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n1 0 0\n0 1 0\n3 0 1 2\n',
  vtk: '# vtk DataFile Version 3.0\nTriangle\nASCII\nDATASET POLYDATA\nPOINTS 3 float\n0 0 0 1 0 0 0 1 0\nPOLYGONS 1 4\n3 0 1 2\n',
  vtp: '<VTKFile type="PolyData"><PolyData><Piece NumberOfPoints="3" NumberOfPolys="1"><Points><DataArray format="ascii" NumberOfComponents="3">0 0 0 1 0 0 0 1 0</DataArray></Points><Polys><DataArray Name="connectivity" format="ascii">0 1 2</DataArray><DataArray Name="offsets" format="ascii">3</DataArray></Polys></Piece></PolyData></VTKFile>',
} satisfies Partial<Record<MeshFormat, string>>;

const bytes = (text: string) => new TextEncoder().encode(text);

describe('standard mesh decoders', () => {
  for (const [format, source] of Object.entries(triangle) as [MeshFormat, string][]) {
    it(`retains triangle coordinates from ${format.toUpperCase()}`, async () => {
      const mesh = await parseMeshArtifact(bytes(source), format);
      expect(mesh.sourceFormat).toBe(format);
      expect(mesh.positions).toHaveLength(9);
      expect(mesh.triangles).toEqual(Uint32Array.from([0, 1, 2]));
      expect(mesh.bounds.min).toEqual([0, 0, 0]);
      expect(mesh.bounds.max).toEqual([1, 1, 0]);
    });
  }

  it('keeps an OBJ material colour in the displayed vertex colours', async () => {
    const mesh = await parseMeshArtifact(
      bytes('mtllib triangle.mtl\no Triangle\nv 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl Blue\nf 1 2 3\n'),
      'obj',
      bytes('newmtl Blue\nKd 0.1 0.4 0.8\n'),
    );
    expect(mesh.baseColors?.[2]).toBeGreaterThan(mesh.baseColors?.[0] ?? 1);
  });

  it('gives an actionable reason for compressed VTP arrays', async () => {
    const source = '<VTKFile type="PolyData" compressor="vtkZLibDataCompressor"><PolyData/></VTKFile>';
    await expect(parseMeshArtifact(bytes(source), 'vtp')).rejects.toMatchObject({
      code: 'mesh_vtp_compressed',
      message: expect.stringContaining('uncompressed ASCII'),
    } satisfies Partial<MeshFormatError>);
  });

  it('rejects glTF external resources before they can make a hidden request', async () => {
    const source = JSON.stringify({ asset: { version: '2.0' }, buffers: [{ uri: 'private.bin', byteLength: 12 }] });
    await expect(parseMeshArtifact(bytes(source), 'gltf')).rejects.toMatchObject({
      code: 'mesh_external_resource',
      message: expect.stringContaining('self-contained GLB'),
    } satisfies Partial<MeshFormatError>);
  });
});
