import type { RailroadDiagram } from './flow-railroad';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Room between a boxed flow's nodes and its box, and above them for a "parallel" label. */
const BOX_PAD = 8;
const BOX_PAD_PARALLEL = 22;
/** The box's name tab: text of this size on a squared tab this tall. */
const TAB_FONT = 11;
const TAB_HEIGHT = 18;

/**
 * Mark each drawn node with its state class, a tooltip and its key, and make
 * it a button that names its state (`selectable`); label each parallel group
 * "parallel"; box each flow a step runs, its step's name on the box; and drop
 * the rule's name (the card already names the flow).
 */
export function markRailroad(svg: SVGElement, diagram: RailroadDiagram, selectable = false) {
  const nodes = [...svg.querySelectorAll('g.pele-node:not(.pele-special)')];
  nodes.forEach((node, index) => {
    const mark = diagram.marks[index];
    if (!mark) return;
    node.classList.add(`st-${mark.tone}`);
    if (mark.chosen) node.classList.add('is-chosen');
    node.setAttribute('data-key', mark.key);
    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = mark.title;
    node.prepend(title);
    if (!selectable) return;
    node.setAttribute('role', 'button');
    node.setAttribute('tabindex', '0');
    node.setAttribute('aria-label', mark.title);
  });
  for (const { from, to, count } of diagram.parallels) {
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
    label.textContent = `${count} in parallel`;
    boxes[0]!.node.parentElement?.append(label);
  }
  let top = Infinity;
  for (const flow of diagram.boxes) {
    const rects = nodes.slice(flow.from, flow.to).flatMap((node) => {
      const rect = node.querySelector('rect');
      const bounds = ['x', 'y', 'width', 'height'].map((name) => Number(rect?.getAttribute(name)));
      return rect && !bounds.some(Number.isNaN) ? [{ bounds, node }] : [];
    });
    if (!rects.length) continue;
    const left = Math.min(...rects.map(({ bounds }) => bounds[0]!)) - BOX_PAD;
    const right = Math.max(...rects.map(({ bounds }) => bounds[0]! + bounds[2]!)) + BOX_PAD;
    const parallel = diagram.parallels.some(
      (group) => group.from >= flow.from && group.to <= flow.to,
    );
    const boxTop =
      Math.min(...rects.map(({ bounds }) => bounds[1]!)) - (parallel ? BOX_PAD_PARALLEL : BOX_PAD);
    const bottom = Math.max(...rects.map(({ bounds }) => bounds[1]! + bounds[3]!)) + BOX_PAD;
    top = Math.min(top, boxTop - TAB_HEIGHT / 2 - 2);
    const parent = rects[0]!.node.parentElement;
    const frame = document.createElementNS(SVG_NS, 'rect');
    frame.setAttribute('class', 'clio-flow-box');
    frame.setAttribute('data-tone', flow.mark.tone);
    frame.setAttribute('x', String(left));
    frame.setAttribute('y', String(boxTop));
    frame.setAttribute('width', String(right - left));
    frame.setAttribute('height', String(bottom - boxTop));
    frame.setAttribute('rx', '10');
    parent?.prepend(frame);
    // The step's name sits on the box's top edge, like a tab, and selects the step.
    const tab = document.createElementNS(SVG_NS, 'g');
    tab.setAttribute('class', 'clio-flow-box-label');
    tab.setAttribute('data-tone', flow.mark.tone);
    tab.setAttribute('data-key', flow.mark.key);
    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = flow.mark.title;
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String(left + 14));
    text.setAttribute('y', String(boxTop));
    // Inline, so the drawing's own text rules do not resize the tab's name.
    text.setAttribute('style', `font-size: ${TAB_FONT}px; text-anchor: start`);
    const name = boxName(flow.label);
    text.textContent = name;
    const backing = document.createElementNS(SVG_NS, 'rect');
    backing.setAttribute('x', String(left + 6));
    backing.setAttribute('y', String(boxTop - TAB_HEIGHT / 2));
    backing.setAttribute('width', String(name.length * TAB_FONT * 0.6 + 16));
    backing.setAttribute('height', String(TAB_HEIGHT));
    backing.setAttribute('rx', '3');
    tab.append(title, backing, text);
    if (selectable) {
      tab.setAttribute('role', 'button');
      tab.setAttribute('tabindex', '0');
      tab.setAttribute('aria-label', flow.mark.title);
    }
    parent?.append(tab);
  }
  const names = [...svg.querySelectorAll('.pele-rule-name')];
  const box = svg.getAttribute('viewBox')?.split(/\s+/u).map(Number);
  if (names.length !== 1 || !box || box.length !== 4 || box.some(Number.isNaN)) return;
  names[0]!.remove();
  // Keep room above the track for a "parallel" label on its first row, and for a box's name.
  const [x, y, width, height] = box as [number, number, number, number];
  const trim = Math.min(diagram.parallels.length ? 12 : 22, height / 2, top - y);
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

/** A step's name as a box's title: "headline" reads "Headline", "verify_hdf5" "Verify hdf5". */
export function boxName(step: string): string {
  const words = step.replace(/[_-]+/gu, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
