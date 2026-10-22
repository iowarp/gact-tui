import type { RailroadDiagram } from './flow-railroad';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Mark each drawn node with its state class and a tooltip, label each
 * parallel group "parallel", title each sub-flow's rule, and drop the main
 * rule's name when it is the only rule (the card already names the flow).
 */
export function markRailroad(svg: SVGElement, diagram: RailroadDiagram) {
  const nodes = [...svg.querySelectorAll('g.pele-node:not(.pele-special)')];
  nodes.forEach((node, index) => {
    const mark = diagram.marks[index];
    if (!mark) return;
    node.classList.add(`st-${mark.tone}`);
    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = mark.title;
    node.prepend(title);
  });
  for (const { from, to } of diagram.parallels) {
    const boxes = nodes.slice(from, to).flatMap((node) => {
      const rect = node.querySelector('rect');
      const x = Number(rect?.getAttribute('x'));
      const y = Number(rect?.getAttribute('y'));
      return rect && !Number.isNaN(x) && !Number.isNaN(y) ? [{ x, y, node }] : [];
    });
    if (boxes.length < 2) continue;
    const left = Math.min(...boxes.map((box) => box.x));
    const top = Math.min(...boxes.map((box) => box.y));
    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('class', 'clio-flow-parallel');
    label.setAttribute('x', String(left + 2));
    label.setAttribute('y', String(top - 4));
    label.setAttribute('text-anchor', 'start');
    label.textContent = `${to - from} in parallel`;
    boxes[0]!.node.parentElement?.append(label);
  }
  const names = [...svg.querySelectorAll('.pele-rule-name')];
  names.slice(1).forEach((name, index) => {
    const heading = diagram.headings[index];
    if (heading) name.textContent = heading;
  });
  // Lift each rule's name clear of a "parallel" label on its first row.
  if (diagram.parallels.length && names.length > 1) {
    for (const name of names) {
      const y = Number(name.getAttribute('y'));
      if (!Number.isNaN(y)) name.setAttribute('y', String(y - 9));
    }
  }
  const box = svg.getAttribute('viewBox')?.split(/\s+/u).map(Number);
  if (names.length !== 1 || !box || box.length !== 4 || box.some(Number.isNaN)) return;
  names[0]!.remove();
  // Keep room above the track for a "parallel" label on its first row.
  const [x, y, width, height] = box as [number, number, number, number];
  const trim = Math.min(diagram.parallels.length ? 12 : 22, height / 2);
  svg.setAttribute('viewBox', `${x} ${y + trim} ${width} ${height - trim}`);
  svg.setAttribute('height', String(height - trim));
}

/** Enlarge a drawn diagram by `scale`, never past `limit` pixels wide. */
export function scaleSvg(svg: SVGElement, scale: number, limit: number) {
  const width = Number(svg.getAttribute('width'));
  const height = Number(svg.getAttribute('height'));
  if (!width || !height) return;
  const factor = Math.min(scale, limit / width);
  svg.setAttribute('width', String(Math.round(width * factor)));
  svg.setAttribute('height', String(Math.round(height * factor)));
}
