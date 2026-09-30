// One-off generator for e2e/fixtures/tile-placeholder.png — a minimal, valid
// solid-color raster tile so map screenshots never depend on reaching the
// real tile.openstreetmap.org over the network (flaky/rate-limited in a
// sandboxed CI environment — this is the "local tile routing" #1533 item 6
// calls for, following the desktop-map-csp.spec.ts pattern from gact-tui
// #505). Run once; the output is committed, this script is not imported.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const SIZE = 256;
// A muted, pale blue-green — close enough to a generic basemap water/land
// tone that the map doesn't read as "broken" in a screenshot, without
// depending on any real tile content.
const [r, g, b] = [214, 226, 219];

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // color type: truecolor RGB
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const raw = Buffer.alloc(SIZE * (1 + SIZE * 3));
for (let y = 0; y < SIZE; y += 1) {
  const rowStart = y * (1 + SIZE * 3);
  raw[rowStart] = 0; // filter type: None
  for (let x = 0; x < SIZE; x += 1) {
    const offset = rowStart + 1 + x * 3;
    raw[offset] = r;
    raw[offset + 1] = g;
    raw[offset + 2] = b;
  }
}
const idatData = deflateSync(raw);

const png = Buffer.concat([
  signature,
  chunk('IHDR', ihdr),
  chunk('IDAT', idatData),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync(new URL('./fixtures', import.meta.url), { recursive: true });
writeFileSync(new URL('./fixtures/tile-placeholder.png', import.meta.url), png);
console.log(`Wrote ${png.length} bytes`);
