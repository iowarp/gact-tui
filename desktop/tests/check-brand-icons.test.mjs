// Builds a tiny SYNTHETIC icon set (header bytes only — no real pixel data,
// since checkIconSet only parses PNG IHDR / ICO directory headers) in a tmp
// dir per test, so this never depends on — or risks polluting — a real
// branding/*/icons directory.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, test } from 'node:test';

import { checkIconSet } from '../scripts/check-brand-icons.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = resolve(__dirname, '..', 'scripts', 'check-brand-icons.mjs');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function makePng(width, height) {
  const buffer = Buffer.alloc(24);
  PNG_SIGNATURE.copy(buffer, 0);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function makeIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(frames.length, 4);
  const entries = frames.map(({ width, height }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(width === 256 ? 0 : width, 0);
    entry.writeUInt8(height === 256 ? 0 : height, 1);
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    return entry;
  });
  return Buffer.concat([header, ...entries]);
}

// A real ICNS carries one or more TLV chunks after its 8-byte header (4-byte
// ASCII type + 4-byte big-endian length, length INCLUDING that header).
// `makeIcns()` embeds one minimal "ic10" image chunk by default — the
// smallest fixture that satisfies assertIcnsHeader's "at least one image
// chunk" requirement — sized to keep the previous default 24-byte total.
// Pass `{ length: 8 }` for a header with zero chunks (the F1 fixture below).
const ICNS_CHUNK_TYPE = 'ic10';
const ICNS_CHUNK_LENGTH = 16; // 8-byte chunk header + 8 dummy payload bytes

function makeIcns({ length } = {}) {
  const totalLength = length ?? 8 + ICNS_CHUNK_LENGTH;
  const buffer = Buffer.alloc(totalLength);
  buffer.write('icns', 0, 'ascii');
  buffer.writeUInt32BE(totalLength, 4);
  if (totalLength >= 8 + ICNS_CHUNK_LENGTH) {
    buffer.write(ICNS_CHUNK_TYPE, 8, 'ascii');
    buffer.writeUInt32BE(ICNS_CHUNK_LENGTH, 12);
  }
  return buffer;
}

/**
 * A minimal, real-shaped ICO: ICONDIR (6 bytes) + one ICONDIRENTRY (16
 * bytes) = 22 bytes total, with NO room for the entry's own image bytes.
 * The entry declares a 256x256 frame whose data (`dwBytesInRes` at
 * offset+8, `dwImageOffset` at offset+12) starts exactly at EOF and is 40
 * bytes long — so it necessarily overruns the file. F1 fixture.
 */
function makeTruncatedIco() {
  const buffer = Buffer.alloc(22);
  buffer.writeUInt16LE(1, 2); // type: icon
  buffer.writeUInt16LE(1, 4); // 1 entry
  const entry = 6;
  buffer.writeUInt8(0, entry); // width byte 0 => 256
  buffer.writeUInt8(0, entry + 1); // height byte 0 => 256
  buffer.writeUInt16LE(1, entry + 4); // color planes
  buffer.writeUInt16LE(32, entry + 6); // bits per pixel
  buffer.writeUInt32LE(40, entry + 8); // dwBytesInRes
  buffer.writeUInt32LE(22, entry + 12); // dwImageOffset — at EOF, plus size overflows
  return buffer;
}

/** A COMPLETE, valid synthetic icon set — the baseline every test mutates from. */
function completeIconSet() {
  return {
    '32x32.png': makePng(32, 32),
    '128x128.png': makePng(128, 128),
    '128x128@2x.png': makePng(256, 256),
    'icon.png': makePng(512, 512),
    'icon.ico': makeIco([
      { width: 16, height: 16 },
      { width: 32, height: 32 },
      { width: 256, height: 256 },
    ]),
    'icon.icns': makeIcns(),
  };
}

let tmpDir;
function writeIconSet(overrides = {}) {
  tmpDir = mkdtempSync(resolve(tmpdir(), 'gact-tui-brand-icons-'));
  const files = { ...completeIconSet(), ...overrides };
  for (const [name, content] of Object.entries(files)) {
    if (content === null) continue; // omit this file entirely
    writeFileSync(resolve(tmpDir, name), content);
  }
  return tmpDir;
}

afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = undefined;
});

test('a complete synthetic icon set passes every check (icon.icns not required by the tracked neutral config)', () => {
  const dir = writeIconSet();
  const { ok, results } = checkIconSet(dir);

  assert.equal(ok, true);
  assert.equal(results.length, 5);
  assert.ok(results.every((result) => result.ok));
  assert.ok(
    !results.some((result) => result.file === 'icon.icns'),
    'the tracked base tauri.conf.json never names icon.icns, so it is not checked by default',
  );
});

test('with requireIcns: true, a complete set including a valid icns passes all six checks', () => {
  const dir = writeIconSet();
  const { ok, results } = checkIconSet(dir, { requireIcns: true });

  assert.equal(ok, true);
  assert.equal(results.length, 6);
  assert.ok(results.every((result) => result.ok));
});

test('rejects a wrong-sized fixed-size icon (32x32.png drawn at 16x16)', () => {
  const dir = writeIconSet({ '32x32.png': makePng(16, 16) });
  const { ok, results } = checkIconSet(dir);

  assert.equal(ok, false);
  const failure = results.find((result) => result.file === '32x32.png');
  assert.equal(failure.ok, false);
  assert.match(failure.detail, /expected 32x32, found 16x16/);
});

test('rejects icon.png under the 512px floor', () => {
  const dir = writeIconSet({ 'icon.png': makePng(256, 256) });
  const { ok, results } = checkIconSet(dir);

  assert.equal(ok, false);
  const failure = results.find((result) => result.file === 'icon.png');
  assert.match(failure.detail, /at least 512x512, found 256x256/);
});

test('rejects icon.ico when no frame is 256x256', () => {
  const dir = writeIconSet({
    'icon.ico': makeIco([
      { width: 16, height: 16 },
      { width: 128, height: 128 },
    ]),
  });
  const { ok, results } = checkIconSet(dir);

  assert.equal(ok, false);
  const failure = results.find((result) => result.file === 'icon.ico');
  assert.match(failure.detail, /expected a 256x256 frame/);
  assert.match(failure.detail, /16x16, 128x128/);
});

test('rejects a corrupt icon.icns (bad magic, declared length overruns the file)', () => {
  const dir = writeIconSet({ 'icon.icns': Buffer.from('not an icns at all, way too short') });
  const { ok, results } = checkIconSet(dir, { requireIcns: true });

  assert.equal(ok, false);
  const failure = results.find((result) => result.file === 'icon.icns');
  assert.match(failure.detail, /missing the "icns" magic/);
});

// F1: an ICNS whose declared length carries zero chunks (or chunks, but none
// of them an actual image type) is an icon file with no icon in it.
test('rejects an icon.icns with a declared length but zero chunks', () => {
  const dir = writeIconSet({ 'icon.icns': makeIcns({ length: 8 }) });
  const { ok, results } = checkIconSet(dir, { requireIcns: true });

  assert.equal(ok, false);
  const failure = results.find((result) => result.file === 'icon.icns');
  assert.match(failure.detail, /no image chunk found/);
});

// F1: an ICO whose single 256x256 entry's own declared image data (offset +
// size) extends past the end of the file — a header that "parses" while
// pointing at truncated or absent pixel data.
test('rejects a 22-byte ICO whose single 256x256 entry points past EOF', () => {
  const dir = writeIconSet({ 'icon.ico': makeTruncatedIco() });
  const { ok, results } = checkIconSet(dir);

  assert.equal(ok, false);
  const failure = results.find((result) => result.file === 'icon.ico');
  assert.match(failure.detail, /extends past end of file \(22 bytes\)/);
});

test('reports a missing file as "missing", not a stack trace', () => {
  const dir = writeIconSet({ 'icon.icns': null });
  const { ok, results } = checkIconSet(dir, { requireIcns: true });

  assert.equal(ok, false);
  const failure = results.find((result) => result.file === 'icon.icns');
  assert.equal(failure.detail, 'missing');
});

test('the CLI accepts a directory argument and, with --require-icns, exits non-zero on a real gap', () => {
  const dir = writeIconSet({ 'icon.icns': null });
  const result = spawnSync(process.execPath, [scriptPath, dir, '--require-icns'], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL icon\.icns: missing/);
});

test('the CLI exits zero for a complete set (icon.icns not required by default)', () => {
  const dir = writeIconSet();
  const result = spawnSync(process.execPath, [scriptPath, dir], { encoding: 'utf8' });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /complete icon set/);
  assert.ok(!result.stdout.includes('icon.icns'));
});

test('the CLI --require-icns flag exits zero for a complete set including a valid icns', () => {
  const dir = writeIconSet();
  const result = spawnSync(process.execPath, [scriptPath, dir, '--require-icns'], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /ok\s+icon\.icns: ok/);
});
