import { createContext } from 'react';

export const SCOPED_DOCUMENT_LINK = '/__clio_bundle_file__/';
export const ScopedDocumentNavigation = createContext<{
  current: string;
  files: readonly string[];
  open: (path: string) => void;
} | null>(null);

/** Resolve only existing files in the supplied bundle, without filesystem access. */
export function bundleFileTarget(
  current: string,
  href: string,
  files: readonly string[],
): string | undefined {
  if (!href || /^[a-z][a-z\d+.-]*:|^[/\\#]/iu.test(href)) return;
  let decoded: string;
  try {
    decoded = decodeURIComponent(href.split(/[?#]/u)[0]);
  } catch {
    return;
  }
  if (
    decoded.includes('\\') ||
    [...decoded].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    return;
  const parts = current.split('/').slice(0, -1);
  for (const part of decoded.split('/')) {
    if (part === '..') {
      if (!parts.length) return;
      parts.pop();
    } else if (part && part !== '.') parts.push(part);
  }
  const target = parts.join('/');
  return files.includes(target) ? target : undefined;
}

interface Node {
  type: string;
  url?: string;
  children?: Node[];
}

/** Encode whitelisted relative links before generic Markdown URL sanitization. */
export function remarkBundleFiles(current: string, files: readonly string[]) {
  return () => (tree: Node) => {
    const visit = (node: Node) => {
      const target =
        node.type === 'link' && node.url ? bundleFileTarget(current, node.url, files) : undefined;
      if (target) node.url = SCOPED_DOCUMENT_LINK + encodeURIComponent(target);
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
