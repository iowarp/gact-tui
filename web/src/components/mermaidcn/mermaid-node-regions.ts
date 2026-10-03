/** Maps the bounded workflow's ordered nodes onto Mermaid's sanitized flowchart rectangles. */
export function mermaidNodeRegions(svg: string, nodes: readonly { id: string }[]): Array<{ id: string; x: number; y: number; width: number; height: number }> {
  if (!svg || !nodes.length) return [];
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const viewBox = document.documentElement.getAttribute('viewBox')?.split(/\s+/u).map(Number);
  const originX = viewBox?.length === 4 && Number.isFinite(viewBox[0]) ? viewBox[0]! : 0;
  const originY = viewBox?.length === 4 && Number.isFinite(viewBox[1]) ? viewBox[1]! : 0;
  return [...document.querySelectorAll('g.node')].flatMap((group) => {
    const index = Number(group.id.match(/flowchart-node(\d+)-/u)?.[1]);
    const node = nodes[index];
    const position = group.getAttribute('transform')?.match(/translate\(\s*([-\d.]+)[, ]+([-\d.]+)\s*\)/u);
    const rectangle = group.querySelector('rect.label-container');
    if (!node || !position || !rectangle) return [];
    const x = Number(position[1]) + Number(rectangle.getAttribute('x')) - originX;
    const y = Number(position[2]) + Number(rectangle.getAttribute('y')) - originY;
    const width = Number(rectangle.getAttribute('width'));
    const height = Number(rectangle.getAttribute('height'));
    return [x, y, width, height].every(Number.isFinite) && width > 0 && height > 0
      ? [{ id: node.id, x, y, width, height }] : [];
  });
}
