#!/usr/bin/env node
// Assert a Tauri icon directory carries a COMPLETE brand icon set, by
// parsing PNG IHDR chunks and the ICO directory header directly — no
// image-decoding dependency, matching this repo's "no new deps for a
// checker script" convention (see gen-brand-backend.mjs).
//
// Why this exists: desktop/src-tauri/icons/ ships the NEUTRAL gact-tui
// icons; clio-agent's clio-bundles.yml workflow copies its OWN CLIO icon
// family (branding/clio/icons/) over them in an "Apply CLIO icons" step
// before building. That copy has no size/format check today — a truncated
// or wrong-sized asset would only surface as a broken app icon in a shipped
// installer. This script gives that workflow (or any brand's icon
// directory) something to run BEFORE the bundler, on an explicit path.
//
// Usage:
//   node scripts/check-brand-icons.mjs [icons-dir]
//   icons-dir defaults to src-tauri/icons relative to this script.
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ICONS_DIR = resolve(__dirname, '..', 'src-tauri', 'icons');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ICNS_MAGIC = 'icns';

/**
 * @typedef {{ file: string; ok: boolean; detail: string }} CheckResult
 */

/**
 * Read a PNG's pixel dimensions from its IHDR chunk (the first chunk after
 * the 8-byte signature: 4-byte length, 4-byte type, then 4-byte big-endian
 * width and height).
 * @param {Buffer} buffer
 * @returns {{ width: number; height: number }}
 */
function readPngDimensions(buffer) {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('not a PNG file (bad signature)');
  }
  const chunkType = buffer.toString('ascii', 12, 16);
  if (chunkType !== 'IHDR') {
    throw new Error(`expected IHDR as the first chunk, found "${chunkType}"`);
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/**
 * Read an ICO's frame dimensions from its ICONDIR + ICONDIRENTRY headers.
 * Each 16-byte ICONDIRENTRY's width/height bytes use 0 to mean 256.
 * @param {Buffer} buffer
 * @returns {{ width: number; height: number }[]}
 */
function readIcoFrames(buffer) {
  if (buffer.length < 6) throw new Error('too small to be an ICO');
  const reserved = buffer.readUInt16LE(0);
  const type = buffer.readUInt16LE(2);
  if (reserved !== 0 || type !== 1) throw new Error('missing the ICO directory header');
  const count = buffer.readUInt16LE(4);
  const frames = [];
  for (let i = 0; i < count; i += 1) {
    const offset = 6 + i * 16;
    if (offset + 16 > buffer.length) throw new Error(`truncated ICONDIRENTRY #${i}`);
    const rawWidth = buffer.readUInt8(offset);
    const rawHeight = buffer.readUInt8(offset + 1);
    frames.push({ width: rawWidth === 0 ? 256 : rawWidth, height: rawHeight === 0 ? 256 : rawHeight });
  }
  return frames;
}

/**
 * Validate an ICNS file's header: the 4-byte "icns" magic, then a 4-byte
 * big-endian total length that must fit inside the actual file.
 * @param {Buffer} buffer
 */
function assertIcnsHeader(buffer) {
  if (buffer.length < 8) throw new Error('too small to be an ICNS');
  const magic = buffer.toString('ascii', 0, 4);
  if (magic !== ICNS_MAGIC) throw new Error('missing the "icns" magic');
  const declaredLength = buffer.readUInt32BE(4);
  if (declaredLength < 8 || declaredLength > buffer.length) {
    throw new Error(
      `declared length ${declaredLength} does not fit the file (${buffer.length} bytes)`,
    );
  }
}

/**
 * The required file set and its per-file assertion. Each checker receives
 * the file's raw bytes and throws (with a human-readable reason) on failure.
 * @type {{ file: string; check: (buffer: Buffer) => void }[]}
 */
const REQUIREMENTS = [
  {
    file: '32x32.png',
    check(buffer) {
      const { width, height } = readPngDimensions(buffer);
      if (width !== 32 || height !== 32) {
        throw new Error(`expected 32x32, found ${width}x${height}`);
      }
    },
  },
  {
    file: '128x128.png',
    check(buffer) {
      const { width, height } = readPngDimensions(buffer);
      if (width !== 128 || height !== 128) {
        throw new Error(`expected 128x128, found ${width}x${height}`);
      }
    },
  },
  {
    file: '128x128@2x.png',
    check(buffer) {
      const { width, height } = readPngDimensions(buffer);
      if (width !== 256 || height !== 256) {
        throw new Error(`expected 256x256 (the @2x frame), found ${width}x${height}`);
      }
    },
  },
  {
    file: 'icon.png',
    check(buffer) {
      const { width, height } = readPngDimensions(buffer);
      if (width < 512 || height < 512) {
        throw new Error(`expected at least 512x512, found ${width}x${height}`);
      }
    },
  },
  {
    file: 'icon.ico',
    check(buffer) {
      const frames = readIcoFrames(buffer);
      const has256 = frames.some((frame) => frame.width === 256 && frame.height === 256);
      if (!has256) {
        const found = frames.map((frame) => `${frame.width}x${frame.height}`).join(', ') || '(none)';
        throw new Error(`expected a 256x256 frame, frames present: ${found}`);
      }
    },
  },
  {
    file: 'icon.icns',
    check: assertIcnsHeader,
  },
];

/**
 * Check every required icon in `iconsDir`. Pure/testable: never touches
 * process.exit or stdout — callers decide what to do with the results.
 * @param {string} iconsDir
 * @returns {{ ok: boolean; results: CheckResult[] }}
 */
export function checkIconSet(iconsDir) {
  const results = REQUIREMENTS.map(({ file, check }) => {
    const path = resolve(iconsDir, file);
    try {
      const stats = statSync(path);
      if (!stats.isFile()) throw new Error('not a regular file');
      check(readFileSync(path));
      return { file, ok: true, detail: 'ok' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const reason = err && /** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT'
        ? 'missing'
        : message;
      return { file, ok: false, detail: reason };
    }
  });
  return { ok: results.every((result) => result.ok), results };
}

function main(argv) {
  const iconsDir = argv[0] ? resolve(argv[0]) : DEFAULT_ICONS_DIR;
  const { ok, results } = checkIconSet(iconsDir);
  for (const result of results) {
    console.log(`${result.ok ? 'ok  ' : 'FAIL'} ${result.file}: ${result.detail}`);
  }
  if (!ok) {
    console.error(`check-brand-icons: incomplete icon set in ${iconsDir}`);
    process.exitCode = 1;
    return;
  }
  console.log(`check-brand-icons: complete icon set in ${iconsDir}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
