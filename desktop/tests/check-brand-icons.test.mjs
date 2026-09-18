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

function makeIcns(length = 24) {
  const buffer = Buffer.alloc(length);
  buffer.write('icns', 0, 'ascii');
  buffer.writeUInt32BE(buffer.length, 4);
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

test('a complete synthetic icon set passes every check', () => {
  const dir = writeIconSet();
  const { ok, results } = checkIconSet(dir);

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
  const { ok, results } = checkIconSet(dir);

  assert.equal(ok, false);
  const failure = results.find((result) => result.file === 'icon.icns');
  assert.match(failure.detail, /missing the "icns" magic/);
});

test('reports a missing file as "missing", not a stack trace', () => {
  const dir = writeIconSet({ 'icon.icns': null });
  const { ok, results } = checkIconSet(dir);

  assert.equal(ok, false);
  const failure = results.find((result) => result.file === 'icon.icns');
  assert.equal(failure.detail, 'missing');
});

test('the CLI accepts a directory argument and exits non-zero on a real gap', () => {
  const dir = writeIconSet({ 'icon.icns': null });
  const result = spawnSync(process.execPath, [scriptPath, dir], { encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL icon\.icns: missing/);
});

test('the CLI exits zero for a complete set', () => {
  const dir = writeIconSet();
  const result = spawnSync(process.execPath, [scriptPath, dir], { encoding: 'utf8' });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /complete icon set/);
});
