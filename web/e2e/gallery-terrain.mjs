/** A self-contained coloured terrain GLB for the public component gallery. */
export function makeGalleryTerrainGlb() {
  const cells = 32;
  const stride = cells + 1;
  const positions = new Float32Array(stride * stride * 3);
  const colors = new Float32Array(positions.length);
  const indices = new Uint16Array(cells * cells * 6);
  const low = [0.035, 0.42, 0.56];
  const middle = [0.11, 0.73, 0.57];
  const high = [0.98, 0.69, 0.27];
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  for (let z = 0; z <= cells; z += 1) {
    for (let x = 0; x <= cells; x += 1) {
      const east = (x / cells - 0.5) * 8;
      const north = (z / cells - 0.5) * 8;
      const ridge = 2.2 * Math.exp(-((east + 0.8) ** 2 / 5 + (north - 0.2) ** 2 / 2));
      const peak = 1.6 * Math.exp(-((east - 1.45) ** 2 / 1.3 + (north + 0.7) ** 2 / 2.4));
      const basin = 0.7 * Math.exp(-((east + 2.4) ** 2 / 1.5 + (north + 2) ** 2 / 1.8));
      const height = 0.35 + ridge + peak - basin + 0.13 * Math.sin(east * 2) * Math.cos(north * 1.7);
      minHeight = Math.min(minHeight, height);
      maxHeight = Math.max(maxHeight, height);
      const offset = (z * stride + x) * 3;
      positions.set([east, height, north], offset);
      const t = Math.max(0, Math.min(1, (height + 0.3) / 3.2));
      const from = t < 0.55 ? low : middle;
      const to = t < 0.55 ? middle : high;
      const mix = t < 0.55 ? t / 0.55 : (t - 0.55) / 0.45;
      colors.set(from.map((channel, index) => channel + (to[index] - channel) * mix), offset);
    }
  }
  let cursor = 0;
  for (let z = 0; z < cells; z += 1) {
    for (let x = 0; x < cells; x += 1) {
      const a = z * stride + x;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.set([a, c, b, b, c, d], cursor);
      cursor += 6;
    }
  }
  const positionBytes = Buffer.from(positions.buffer);
  const colorBytes = Buffer.from(colors.buffer);
  const indexBytes = Buffer.from(indices.buffer);
  const binary = Buffer.concat([positionBytes, colorBytes, indexBytes]);
  const gltf = {
    asset: { version: '2.0', generator: 'CLIO gallery terrain' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ name: 'Coastal elevation', primitives: [{ attributes: { POSITION: 0, COLOR_0: 1 }, indices: 2, material: 0 }] }],
    materials: [{ name: 'Elevation colours', doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.9 } }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBytes.length, target: 34962 },
      { buffer: 0, byteOffset: positionBytes.length, byteLength: colorBytes.length, target: 34962 },
      { buffer: 0, byteOffset: positionBytes.length + colorBytes.length, byteLength: indexBytes.length, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: stride * stride, type: 'VEC3', min: [-4, minHeight, -4], max: [4, maxHeight, 4] },
      { bufferView: 1, componentType: 5126, count: stride * stride, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: indices.length, type: 'SCALAR' },
    ],
  };
  const json = Buffer.from(JSON.stringify(gltf));
  const paddedJson = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
  const glb = Buffer.alloc(12 + 8 + paddedJson.length + 8 + binary.length);
  glb.write('glTF', 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(paddedJson.length, 12);
  glb.write('JSON', 16);
  paddedJson.copy(glb, 20);
  const binaryOffset = 20 + paddedJson.length;
  glb.writeUInt32LE(binary.length, binaryOffset);
  glb.write('BIN\0', binaryOffset + 4);
  binary.copy(glb, binaryOffset + 8);
  return glb;
}
