// Builds tiny SYNTHETIC BMPs (a real BITMAPFILEHEADER + BITMAPINFOHEADER, no
// actual pixel data — checkInstallerArt only parses those headers) in a tmp
// dir per test, so this never depends on — or risks polluting — a real
// branding/*/installer directory.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, test } from 'node:test';

import { checkInstallerArt } from '../scripts/check-installer-art.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = resolve(__dirname, '..', 'scripts', 'check-installer-art.mjs');

/**
 * A minimal, real-shaped BMP: 14-byte BITMAPFILEHEADER + 40-byte
 * BITMAPINFOHEADER, no pixel data (checkInstallerArt never reads past byte
 * 34). `bitsPerPixel` defaults to 24 and `compression` to 0 (BI_RGB) — the
 * values a real NSIS-ready bitmap must have.
 */
function makeBmp(width, height, { bitsPerPixel = 24, compression = 0 } = {}) {
  const buffer = Buffer.alloc(54);
  buffer.write('BM', 0, 'ascii');
  buffer.writeUInt32LE(54, 2); // file size (header only — fine, unchecked)
  buffer.writeUInt32LE(54, 10); // pixel data offset
  buffer.writeUInt32LE(40, 14); // BITMAPINFOHEADER size
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26); // color planes
  buffer.writeUInt16LE(bitsPerPixel, 28);
  buffer.writeUInt32LE(compression, 30);
  return buffer;
}

/** A COMPLETE, valid synthetic installer art set — the baseline every test mutates from. */
function completeArtSet() {
  return {
    'header.bmp': makeBmp(150, 57),
    'sidebar.bmp': makeBmp(164, 314),
  };
}

let tmpDir;
function writeArtSet(overrides = {}) {
  tmpDir = mkdtempSync(resolve(tmpdir(), 'gact-tui-installer-art-'));
  const files = { ...completeArtSet(), ...overrides };
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

test('a complete synthetic installer art set passes every check', () => {
  const dir = writeArtSet();
  const { ok, results } = checkInstallerArt(dir);

  assert.equal(ok, true);
  assert.equal(results.length, 2);
  assert.ok(results.every((result) => result.ok));
});

test('accepts a top-down bitmap (negative height) at the same pixel dimensions', () => {
  const dir = writeArtSet({ 'header.bmp': makeBmp(150, -57) });
  const { ok, results } = checkInstallerArt(dir);

  assert.equal(ok, true);
  assert.ok(results.find((result) => result.file === 'header.bmp').ok);
});

test('rejects a wrong-sized header.bmp', () => {
  const dir = writeArtSet({ 'header.bmp': makeBmp(150, 150) });
  const { ok, results } = checkInstallerArt(dir);

  assert.equal(ok, false);
  const failure = results.find((result) => result.file === 'header.bmp');
  assert.match(failure.detail, /expected 150x57, found 150x150/);
});

test('rejects a wrong-sized sidebar.bmp', () => {
  const dir = writeArtSet({ 'sidebar.bmp': makeBmp(164, 164) });
  const { ok, results } = checkInstallerArt(dir);

  assert.equal(ok, false);
  const failure = results.find((result) => result.file === 'sidebar.bmp');
  assert.match(failure.detail, /expected 164x314, found 164x164/);
});

test('rejects a bitmap that is not 24-bit', () => {
  const dir = writeArtSet({ 'header.bmp': makeBmp(150, 57, { bitsPerPixel: 32 }) });
  const { ok, results } = checkInstallerArt(dir);

  assert.equal(ok, false);
  const failure = results.find((result) => result.file === 'header.bmp');
  assert.match(failure.detail, /expected a 24-bit bitmap, found 32-bit/);
});

test('rejects a compressed bitmap', () => {
  const dir = writeArtSet({ 'sidebar.bmp': makeBmp(164, 314, { compression: 1 }) });
  const { ok, results } = checkInstallerArt(dir);

  assert.equal(ok, false);
  const failure = results.find((result) => result.file === 'sidebar.bmp');
  assert.match(failure.detail, /uncompressed \(BI_RGB\) bitmap, found compression method 1/);
});

test('rejects a file with a bad "BM" magic', () => {
  const dir = writeArtSet({ 'header.bmp': Buffer.alloc(54) });
  const { ok, results } = checkInstallerArt(dir);

  assert.equal(ok, false);
  const failure = results.find((result) => result.file === 'header.bmp');
  assert.match(failure.detail, /bad "BM" magic/);
});

test('reports a missing file as "missing", not a stack trace', () => {
  const dir = writeArtSet({ 'sidebar.bmp': null });
  const { ok, results } = checkInstallerArt(dir);

  assert.equal(ok, false);
  const failure = results.find((result) => result.file === 'sidebar.bmp');
  assert.equal(failure.detail, 'missing');
});

test('the CLI requires a directory argument', () => {
  const result = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: check-installer-art\.mjs <art-dir>/);
});

test('the CLI exits non-zero and prints each failure for an incomplete set', () => {
  const dir = writeArtSet({ 'sidebar.bmp': null });
  const result = spawnSync(process.execPath, [scriptPath, dir], { encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL sidebar\.bmp: missing/);
  assert.match(result.stdout, /ok\s+header\.bmp: ok/);
});

test('the CLI exits zero for a complete, valid set', () => {
  const dir = writeArtSet();
  const result = spawnSync(process.execPath, [scriptPath, dir], { encoding: 'utf8' });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /valid installer art/);
});
