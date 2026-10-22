import { MAX_DIAGRAM_SOURCE_CHARS } from '@/lib/runtime-limits';
import { workspaceFolderPath } from '@/lib/workspace-folder-reference';

export interface DiagramFolderLink {
  id: string;
  label: string;
  path: string;
}

/** Extract explicit read-only navigation; arbitrary Mermaid click callbacks remain unsupported. */
export function parseDiagramSource(source: string): {
  source: string;
  folders: DiagramFolderLink[];
} {
  if (!source.trim()) throw new Error('Diagram source is empty');
  if (source.length > MAX_DIAGRAM_SOURCE_CHARS)
    throw new Error('Diagram exceeds the rendering limit');
  const folders: DiagramFolderLink[] = [];
  const rendered = source
    .split('\n')
    .filter((line) => {
      if (!/^\s*click\b/iu.test(line)) return true;
      const match = line.match(
        /^\s*click\s+([\w-]+)\s+(?:href\s+)?"(workspace-folder:[^"]+)"(?:\s+"([^"]*)")?\s*;?\s*$/u,
      );
      if (!match) throw new Error('Diagram contains an unsupported executable or HTML directive');
      const path = workspaceFolderPath(match[2]!);
      if (path === undefined)
        throw new Error('Diagram clicks must name a relative workspace-folder target.');
      if (folders.some((folder) => folder.id === match[1]))
        throw new Error('Diagram repeats a folder target for one node.');
      folders.push({ id: match[1]!, path, label: match[3] || `Open folder ${path}` });
      return false;
    })
    .join('\n');
  if (
    /<\s*(?:\/?[A-Za-z][^>]*|[!?][^>]*)>|%%\{|\bhref\b|javascript:|data:text\/html|url\s*\(|(?:^|[;\n])\s*click\b/imu.test(
      rendered,
    )
  ) {
    throw new Error('Diagram contains an unsupported executable or HTML directive');
  }
  return { source: rendered, folders };
}

export function validateMermaidSource(source: string): void {
  parseDiagramSource(source);
}

/** CSS that reaches outside the drawing: an import, or a url() that is not a #fragment. */
const EXTERNAL_CSS = /@import|url\s*\(\s*['"]?\s*(?!#)|expression\s*\(/iu;

export function sanitizeMermaidSvg(svg: string): SVGElement {
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (parsed.querySelector('parsererror')) throw new Error('Diagram renderer returned invalid SVG');
  // Animation elements can set any attribute later (an href, an event handler), after
  // the attribute pass below has run; a drawing needs none of them.
  parsed
    .querySelectorAll(
      'script,foreignObject,iframe,object,embed,animate,set,animateMotion,animateTransform,animateColor',
    )
    .forEach((node) => node.remove());
  parsed.querySelectorAll('style').forEach((node) => {
    if (EXTERNAL_CSS.test(node.textContent ?? '')) node.remove();
  });
  parsed.querySelectorAll('*').forEach((node) => {
    for (const attribute of [...node.attributes]) {
      if (
        /^on/iu.test(attribute.name) ||
        /^(?:href|xlink:href)$/iu.test(attribute.name) ||
        (attribute.name === 'style' && EXTERNAL_CSS.test(attribute.value))
      ) {
        node.removeAttribute(attribute.name);
      }
    }
  });
  const root = parsed.documentElement;
  if (root.localName !== 'svg') throw new Error('Diagram renderer did not return SVG');
  return root as unknown as SVGElement;
}
