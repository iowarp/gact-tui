import remarkMath from 'remark-math';

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

function classes(node: HastNode): readonly unknown[] {
  const value = node.properties?.className;
  return Array.isArray(value) ? value : [];
}

function text(node: HastNode): string {
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(text).join('');
}

/** About how many characters wide KaTeX draws a TeX source: each command is one glyph. */
export function renderedMathWidth(tex: string): number {
  const glyphs = tex
    .replace(/\\(?:left|right|big|Big|bigg|Bigg|displaystyle|mathrm|text|operatorname)\b/gu, '')
    .replace(/\\[a-zA-Z]+/gu, 'x')
    .replace(/[{}^_\s]/gu, '');
  return Math.max(1, glyphs.length);
}

function inlinePlaceholder(tex: string): HastNode {
  return {
    type: 'element',
    tagName: 'span',
    properties: {
      ariaHidden: 'true',
      className: ['rounded-[3px]', 'bg-muted-foreground/10'],
      dataMathPending: 'inline',
      style: `display:inline-block;width:${renderedMathWidth(tex)}ch;height:1em;vertical-align:-0.15em`,
    },
    children: [],
  };
}

function blockPlaceholder(tex: string): HastNode {
  const lines = tex.split(/\\\\/u).length;
  const tall = /\\(?:frac|dfrac|sum|int|prod|begin)/u.test(tex) ? 0.9 : 0;
  return {
    type: 'element',
    tagName: 'div',
    properties: {
      ariaHidden: 'true',
      className: ['rounded-[3px]', 'bg-muted-foreground/10'],
      dataMathPending: 'display',
      style: `margin:1em auto;height:${(lines * 1.2 + tall).toFixed(1)}em;width:min(100%,${renderedMathWidth(tex)}ch)`,
    },
    children: [],
  };
}

function isMath(node: HastNode | undefined): boolean {
  const own = node?.tagName === 'code' ? classes(node) : [];
  return own.includes('language-math') || own.includes('math-inline') || own.includes('math-display');
}

// As rehype-katex reads it: math code inside a `pre` is display math, anywhere else inline.
function replaceMath(node: HastNode): HastNode {
  if (node.type !== 'element') return node;
  if (node.tagName === 'pre') {
    const code = node.children?.find(isMath);
    if (code) return blockPlaceholder(text(code));
  }
  if (isMath(node))
    return classes(node).includes('math-display')
      ? blockPlaceholder(text(node))
      : inlinePlaceholder(text(node));
  if (node.children) node.children = node.children.map(replaceMath);
  return node;
}

function rehypePendingMath() {
  return (tree: HastNode) => {
    if (tree.children) tree.children = tree.children.map(replaceMath);
  };
}

/**
 * Streamdown's math plugin while KaTeX loads: the same syntax, with each formula
 * drawn as a faint box of about its rendered size instead of its TeX source.
 */
export const pendingMathPlugin = {
  name: 'katex' as const,
  type: 'math' as const,
  remarkPlugin: [remarkMath, { singleDollarTextMath: false }] as [
    typeof remarkMath,
    { singleDollarTextMath: boolean },
  ],
  rehypePlugin: rehypePendingMath,
};
