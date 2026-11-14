// Fails when the translation catalogs are out of date with the source: a message
// written in the code is missing from web/src/locales/*/messages.po, or a catalog
// still carries a message the code no longer has. Run
// `pnpm --filter @clio/workspace i18n:extract` and commit the catalogs to fix it.
//
// It also fails when a translated message drops or invents a placeholder, which
// would show `{name}` or lose a value in that language.
//
// And it fails on a catalog written in the wrong encoding: a byte-order mark, bytes
// that are not UTF-8, or a translation where "??" or U+FFFD stands in for text the
// writer could not encode (a PowerShell pipe saves Greek and Japanese as "?").
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const web = resolve(root, 'web');
const require = createRequire(resolve(web, 'package.json'));
const load = async (specifier) => import(pathToFileURL(require.resolve(specifier)).href);

const { getConfig } = await load('@lingui/conf');
const { getCatalogs } = await load('@lingui/cli/api');
const { compileMessage } = await load('@lingui/message-utils/compileMessage');

/** Placeholder names and element tags a message uses, read from its compiled form. */
export function placeholderSet(message) {
  const set = new Set();
  // A compiled message is a list of parts: text, or [name, format?, branches?].
  const parts = (list) => {
    if (typeof list !== 'string' && !Array.isArray(list)) return;
    for (const part of typeof list === 'string' ? [list] : list) {
      if (typeof part === 'string') {
        for (const tag of part.matchAll(/<\/?(\d+)\/?>/gu)) set.add(`<${tag[1]}>`);
      } else if (Array.isArray(part)) {
        set.add(`{${part[0]}}`);
        if (part[2] && typeof part[2] === 'object') Object.values(part[2]).forEach(parts);
      }
    }
  };
  parts(compileMessage(message));
  return set;
}

/** Runs of two or more "?" and every U+FFFD: what a lossy encoder leaves behind. */
export function lossyRuns(text) {
  return text.match(/\?{2,}|\uFFFD+/gu) ?? [];
}

/** A translation with a lossy run its source message does not have. */
export function lossyTranslation(original, translation) {
  const source = lossyRuns(original);
  return lossyRuns(translation).filter((run) => !source.includes(run));
}

/** A byte-order mark or bytes that are not UTF-8. */
export function encodingProblem(bytes) {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return 'starts with a byte-order mark';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'is UTF-16 (byte-order mark FF FE)';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'is UTF-16 (byte-order mark FE FF)';
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return 'is not valid UTF-8';
  }
  return undefined;
}

function catalogFileFailures() {
  const locales = resolve(web, 'src', 'locales');
  const failures = [];
  for (const locale of readdirSync(locales, { withFileTypes: true })) {
    if (!locale.isDirectory()) continue;
    const file = resolve(locales, locale.name, 'messages.po');
    let bytes;
    try {
      bytes = readFileSync(file);
    } catch {
      continue;
    }
    const problem = encodingProblem(bytes);
    if (problem)
      failures.push(`${locale.name}/messages.po ${problem}; write it as UTF-8 without a BOM.`);
  }
  return failures;
}

async function main() {
  const config = getConfig({ cwd: web });
  const failures = catalogFileFailures();
  for (const catalog of await getCatalogs(config)) {
    const collected = await catalog.collect();
    if (!collected) throw new Error('Message extraction failed');
    const catalogs = await catalog.readAll();
    const source = catalogs[config.sourceLocale] ?? {};
    const expected = new Set(Object.keys(collected));
    const present = new Set(Object.keys(source).filter((id) => !source[id].obsolete));
    const missing = [...expected].filter((id) => !present.has(id));
    const stale = [...present].filter((id) => !expected.has(id));
    if (missing.length || stale.length) {
      const sample = (ids, entries) =>
        ids
          .slice(0, 8)
          .map((id) => `    ${JSON.stringify(entries[id]?.message ?? id)}`)
          .join('\n');
      failures.push(
        `${catalog.path}: ${missing.length} messages missing from the catalogs, ${stale.length} no longer in the code` +
          (missing.length ? `\n  missing:\n${sample(missing, collected)}` : '') +
          (stale.length ? `\n  stale:\n${sample(stale, source)}` : ''),
      );
    }
    for (const [locale, messages] of Object.entries(catalogs)) {
      if (locale === config.sourceLocale) continue;
      for (const [id, entry] of Object.entries(messages)) {
        if (!entry.translation || entry.obsolete) continue;
        const original = collected[id]?.message ?? source[id]?.message ?? id;
        const lossy = lossyTranslation(original, entry.translation);
        if (lossy.length) {
          failures.push(
            `${locale}: ${JSON.stringify(original)} → ${JSON.stringify(entry.translation)} has ${lossy
              .map((run) => JSON.stringify(run))
              .join(' ')}, text lost to the wrong encoding`,
          );
        }
        let got;
        try {
          got = placeholderSet(entry.translation);
        } catch (error) {
          failures.push(
            `${locale}: ${JSON.stringify(entry.translation)} is not a valid message: ${error.message}`,
          );
          continue;
        }
        const want = placeholderSet(original);
        const lost = [...want].filter((token) => !got.has(token));
        const invented = [...got].filter((token) => !want.has(token));
        if (lost.length || invented.length) {
          failures.push(
            `${locale}: ${JSON.stringify(original)} → ${JSON.stringify(entry.translation)}` +
              (lost.length ? ` loses ${lost.join(' ')}` : '') +
              (invented.length ? ` adds ${invented.join(' ')}` : ''),
          );
        }
      }
    }
  }
  if (failures.length) {
    console.error(failures.join('\n'));
    console.error(
      '\ncheck_i18n_catalogs: run `pnpm --filter @clio/workspace i18n:extract`, translate, and commit the catalogs.',
    );
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
