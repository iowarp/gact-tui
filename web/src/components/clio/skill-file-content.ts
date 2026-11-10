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
  const extension = extensionOf(file);
  if (!extension || extension === 'md' || extension === 'markdown')
    return { id: `skill-file:${file}`, type: 'markdown', text };
  if (extension === 'json')
    return { id: `skill-file:${file}`, type: 'code', language: 'json', text };
  if (extension === 'txt') return { id: `skill-file:${file}`, type: 'text', text };
  return { id: `skill-file:${file}`, type: 'code', language: extension, text };
}

/** The download name and type for a loaded skill file (a `#fragment` names part of one file). */
export function skillFileDownload(file: string): { filename: string; mimeType: string } {
  const filename = segments(file).at(-1) || 'skill-file.txt';
  const extension = extensionOf(file);
  const mimeType =
    !extension || extension === 'md' || extension === 'markdown'
      ? 'text/markdown'
      : extension === 'json'
        ? 'application/json'
        : 'text/plain';
  return { filename: extension ? filename : `${filename}.md`, mimeType };
}

/**
 * The folders that lead to a skill file, starting at the skill itself, such as
 * `work-with-ndp › references`. Install locations are long and say nothing
 * about the skill, so the full path stays supplemental detail.
 */
export function skillFileTrail(path: string, directory?: string): string {
  const folders = segments(path).slice(0, -1);
  const root = directory ? segments(directory) : [];
  const within =
    root.length > 0 &&
    root.length <= folders.length &&
    root.every((segment, index) => segment.toLowerCase() === folders[index]?.toLowerCase());
  return (within ? folders.slice(root.length - 1) : folders.slice(-2)).join(' › ');
}

/** A skill file's own name, keeping a `#fragment` that names part of the file. */
export function skillFileTitle(file: string): string {
  const [path = file, ...fragment] = file.split('#');
  const name = segments(path).at(-1) ?? path;
  return fragment.length ? `${name}#${fragment.join('#')}` : name;
}

function segments(path: string): string[] {
  return (path.split('#', 1)[0] ?? path).replaceAll('\\', '/').split('/').filter(Boolean);
}

function extensionOf(file: string): string | undefined {
  return /\.([a-z0-9]+)$/iu.exec(file.split('#', 1)[0] ?? file)?.[1]?.toLowerCase();
}
