import type { ToolPresentationBlock } from '@clio/core/v3';

const COLLAPSED_NOTE =
  /\n\n\(\d+ duplicate file requests? (?:for this same file )?collapsed[^\n]*\)\s*$/u;
// The loader's own index of a skill's files follows the procedure; it is not part of SKILL.md.
const BUNDLED_LISTING = /\n\nBundled files \(use file=[\s\S]*$/u;

/**
 * The exact text one `load_skill` call loaded for one of its files.
 *
 * A single read returns that file's text. A batch labels each file
 * `=== File i/n: <requested file> ===` and may append shared JSON definitions
 * and a duplicate-request note after the last file. Returns `undefined` when
 * the retained text does not (yet) contain that file's section.
 */
export function skillFileSection(
  text: string,
  file: string,
  index: number,
  count: number,
): string | undefined {
  if (count <= 1)
    return (file === 'SKILL.md' ? text.replace(BUNDLED_LISTING, '') : text).replace(
      COLLAPSED_NOTE,
      '',
    );
  const header = `=== File ${index + 1}/${count}: ${file} ===\n`;
  const start = text.indexOf(header);
  if (start < 0) return undefined;
  const rest = text.slice(start + header.length);
  const ends = ['\n\n=== File ', '\n\n### Shared by ']
    .map((marker) => rest.indexOf(marker))
    .filter((position) => position >= 0);
  const section = ends.length ? rest.slice(0, Math.min(...ends)) : rest;
  return section.replace(COLLAPSED_NOTE, '');
}

/** Present a loaded skill file as its own kind of document: prose, JSON or source. */
export function skillFileBlock(file: string, text: string): ToolPresentationBlock {
  const path = file.split('#', 1)[0] ?? file;
  const extension = /\.([a-z0-9]+)$/iu.exec(path)?.[1]?.toLowerCase();
  if (!extension || extension === 'md' || extension === 'markdown')
    return { id: `skill-file:${file}`, type: 'markdown', text };
  if (extension === 'json')
    return { id: `skill-file:${file}`, type: 'code', language: 'json', text };
  if (extension === 'txt') return { id: `skill-file:${file}`, type: 'text', text };
  return { id: `skill-file:${file}`, type: 'code', language: extension, text };
}
