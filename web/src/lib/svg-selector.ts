/** A selector for `element` within its SVG root, unique there, starting at `svg`. */
export function svgSelector(element: Element, root: Element): string {
  const parts: string[] = [];
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node === root) {
      parts.unshift('svg');
      break;
    }
    if (node.id && root.querySelectorAll(`#${CSS.escape(node.id)}`).length === 1) {
      parts.unshift(`#${CSS.escape(node.id)}`);
      return parts.join(' > ');
    }
    const tag = node.tagName.toLowerCase();
    const same = node.parentElement
      ? [...node.parentElement.children].filter((child) => child.tagName === node!.tagName)
      : [];
    parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag);
  }
  return parts.join(' > ');
}
