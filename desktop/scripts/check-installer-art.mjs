#!/usr/bin/env node
// Assert a Windows NSIS installer art directory carries correctly-sized,
// uncompressed 24-bit BMPs, by parsing the BMP file header + BITMAPINFOHEADER
// directly — no image-decoding dependency, matching this repo's "no new deps
// for a checker script" convention (see check-brand-icons.mjs).
//
// Why this exists: `bundle.windows.nsis.headerImage` / `sidebarImage` (see
// desktop/src-tauri/tauri.bundled.conf.json and any brand overlay that adds
// them, e.g. clio-agent's branding/clio/tauri.clio.conf.json) point NSIS at
// BMPs with hard dimension AND format requirements — a wrong-sized or
// compressed bitmap does not fail the Tauri build; it only ever surfaces as a
// broken or blank page in a shipped installer, which is exactly the kind of
// silent-until-shipped gap this script exists to catch before that.
//
// Usage:
//   node scripts/check-installer-art.mjs <art-dir>
//   art-dir must contain header.bmp (150x57) and sidebar.bmp (164x314).
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const BMP_MAGIC = Buffer.from('BM', 'ascii');
const REQUIRED_BITS_PER_PIXEL = 24;
const REQUIRED_COMPRESSION = 0; // BI_RGB — NSIS requires an uncompressed bitmap

/**
 * @typedef {{ file: string; ok: boolean; detail: string }} CheckResult
 */

/**
 * Read a BMP's dimensions, color depth, and compression method from its
 * BITMAPFILEHEADER (14 bytes) + BITMAPINFOHEADER (>= 40 bytes). Height is
 * returned as a positive count of rows — BMP allows a negative height to mark
 * a top-down (rather than the default bottom-up) row order, which does not
 * change the pixel dimensions NSIS cares about.
 * @param {Buffer} buffer
 * @returns {{ width: number; height: number; bitsPerPixel: number; compression: number }}
 */
function readBmpHeader(buffer) {
  if (buffer.length < 54 || !buffer.subarray(0, 2).equals(BMP_MAGIC)) {
    throw new Error('not a BMP file (bad "BM" magic)');
  }
  const dibHeaderSize = buffer.readUInt32LE(14);
  if (dibHeaderSize < 40) {
    throw new Error(
      `unsupported DIB header (expected BITMAPINFOHEADER or later, got size ${dibHeaderSize})`,
    );
  }
  const width = buffer.readInt32LE(18);
  const height = buffer.readInt32LE(22);
  const bitsPerPixel = buffer.readUInt16LE(28);
  const compression = buffer.readUInt32LE(30);
  return { width, height: Math.abs(height), bitsPerPixel, compression };
}

/**
 * The required file set for an NSIS installer art directory. Dimensions match
 * Tauri's documented recommendations for `nsis.headerImage` / `nsis.sidebarImage`.
 * @type {{ file: string; width: number; height: number }[]}
 */
const REQUIREMENTS = [
  { file: 'header.bmp', width: 150, height: 57 },
  { file: 'sidebar.bmp', width: 164, height: 314 },
];

/**
 * Check every required installer bitmap in `artDir`. Pure/testable: never
 * touches process.exit or stdout — callers decide what to do with the results.
 * @param {string} artDir
 * @param {{ requirements?: typeof REQUIREMENTS }} [options]
 * @returns {{ ok: boolean; results: CheckResult[] }}
 */
export function checkInstallerArt(artDir, { requirements = REQUIREMENTS } = {}) {
  const results = requirements.map(({ file, width: expectedWidth, height: expectedHeight }) => {
    const path = resolve(artDir, file);
    try {
      const stats = statSync(path);
      if (!stats.isFile()) throw new Error('not a regular file');
      const { width, height, bitsPerPixel, compression } = readBmpHeader(readFileSync(path));
      if (width !== expectedWidth || height !== expectedHeight) {
        throw new Error(`expected ${expectedWidth}x${expectedHeight}, found ${width}x${height}`);
      }
      if (bitsPerPixel !== REQUIRED_BITS_PER_PIXEL) {
        throw new Error(`expected a 24-bit bitmap, found ${bitsPerPixel}-bit`);
      }
      if (compression !== REQUIRED_COMPRESSION) {
        throw new Error(
          `expected an uncompressed (BI_RGB) bitmap, found compression method ${compression}`,
        );
      }
      return { file, ok: true, detail: 'ok' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const reason =
        err && /** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT' ? 'missing' : message;
      return { file, ok: false, detail: reason };
    }
  });
  return { ok: results.every((result) => result.ok), results };
}

function main(argv) {
  const artDir = argv[0] ? resolve(argv[0]) : undefined;
  if (!artDir) {
    console.error('Usage: check-installer-art.mjs <art-dir>');
    process.exitCode = 1;
    return;
  }
  const { ok, results } = checkInstallerArt(artDir);
  for (const result of results) {
    console.log(`${result.ok ? 'ok  ' : 'FAIL'} ${result.file}: ${result.detail}`);
  }
  if (!ok) {
    console.error(`check-installer-art: incomplete or invalid installer art in ${artDir}`);
    process.exitCode = 1;
    return;
  }
  console.log(`check-installer-art: valid installer art in ${artDir}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
