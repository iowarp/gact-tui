export function validateMermaidSource(source: string): void {
  if (!source.trim()) throw new Error('Diagram source is empty');
  if (source.length > 16_384) throw new Error('Diagram exceeds the rendering limit');
  if (/<|%%\{|\bclick\b|\bhref\b|javascript:|data:text\/html|url\s*\(/iu.test(source)) {
    throw new Error('Diagram contains an unsupported executable or HTML directive');
  }
}

export function sanitizeMermaidSvg(svg: string): SVGElement {
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (parsed.querySelector('parsererror')) throw new Error('Diagram renderer returned invalid SVG');
  parsed.querySelectorAll('script,foreignObject,iframe,object,embed').forEach((node) => node.remove());
  parsed.querySelectorAll('*').forEach((node) => {
    for (const attribute of [...node.attributes]) {
      if (/^on/iu.test(attribute.name) || /^(?:href|xlink:href)$/iu.test(attribute.name)) {
        node.removeAttribute(attribute.name);
      }
    }
  });
  const root = parsed.documentElement;
  if (root.localName !== 'svg') throw new Error('Diagram renderer did not return SVG');
  return root as unknown as SVGElement;
}
