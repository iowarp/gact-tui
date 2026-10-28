import { getFileType, getFileTypeColor } from '@/components/reui/file-type';
import { cn } from './utils';
import { languageForPath } from './code-language';

/** Use the original filename, with MIME fallback for extensionless files. */
export function fileIdentityType(name: string, mediaType = ''): string {
  const named = getFileType(name);
  return named === 'empty' ? getFileType(mediaType) : named;
}

/** Match the vendored format color without a second table, keeping tint quiet. */
export function fileRowTint(name: string, mediaType = ''): string {
  return cn(
    getFileTypeColor(fileIdentityType(name, mediaType)),
    'bg-[color:color-mix(in_oklab,currentColor_3%,var(--card))]',
  );
}

export type TextFileFormat = 'markdown' | 'html' | 'json' | 'csv' | 'source';

/** A declared UI role is not a file format. Keep known filenames consistent across entry paths. */
export function textFileFormat(name: string, mediaType = ''): TextFileFormat {
  const extension = name.split('.').at(-1)?.toLowerCase();
  if (extension === 'json' || extension === 'ipynb') return 'json';
  if (extension === 'md' || extension === 'markdown') return 'markdown';
  if (extension === 'html' || extension === 'htm') return 'html';
  if (extension === 'csv') return 'csv';
  if (!['text', 'plain', 'plaintext'].includes(String(languageForPath(name)))) return 'source';
  const type = mediaType.split(';', 1)[0].trim().toLowerCase();
  if (type === 'application/json' || type.endsWith('+json')) return 'json';
  if (type === 'text/markdown' || type === 'text/x-markdown') return 'markdown';
  if (type === 'text/html') return 'html';
  if (type === 'text/csv') return 'csv';
  return 'source';
}

/** Copy table cells in Data mode; document mode retains surrounding readable text. */
export function renderedFileText(node: HTMLElement | null, tablesOnly = false): string | undefined {
  if (!node) return undefined;
  const tables = Array.from(node.querySelectorAll('table'));
  if (tablesOnly && tables.length)
    return tables
      .map((table) =>
        Array.from(table.rows)
          .map((row) =>
            Array.from(row.cells)
              .map((cell) => cell.innerText ?? cell.textContent ?? '')
              .join('\t'),
          )
          .join('\n'),
      )
      .join('\n\n');
  if (node.innerText !== undefined) return node.innerText;
  const content = node.cloneNode(true) as HTMLElement;
  content
    .querySelectorAll('style, script, [hidden], [aria-hidden="true"]')
    .forEach((element) => element.remove());
  return content.textContent ?? undefined;
}
