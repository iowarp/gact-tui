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

// KaTeX sets math at 1.21 times the surrounding text.
const KATEX_SCALE = 1.21;

/** About how many characters wide KaTeX draws a TeX source: each command is one glyph. */
export function renderedMathWidth(tex: string): number {
  const glyphs = tex
    .replace(
      /\\(?:left|right|big|Big|bigg|Bigg|displaystyle|mathrm|text|operatorname|bar|hat|tilde|vec|dot|ddot|overline)\b/gu,
      '',
    )
    .replace(/\\[a-zA-Z]+/gu, 'x')
    .replace(/[{}^_\s]/gu, '');
  return Math.round(Math.max(1, glyphs.length) * KATEX_SCALE * 10) / 10;
}

// Display limits stack above and below these; integral limits sit beside the sign.
const STACKED_LIMITS = /\\(?:sum|prod|coprod|bigcup|bigcap|lim|max|min|sup|inf)\s*[_^]/u;
const INTEGRAL = /\\(?:int|iint|oint)(?![a-zA-Z])/u;
const FRACTION = /\\(?:frac|dfrac|tfrac|binom|cfrac)(?![a-zA-Z])/u;

/** About how tall KaTeX draws one display line, in ems of the surrounding text. */
function displayLineHeight(line: string): number {
  if (STACKED_LIMITS.test(line)) return 3.8;
  if (INTEGRAL.test(line)) return 3;
  if (FRACTION.test(line)) return 2.6;
  return 1.45;
}

/** About how tall KaTeX draws display math, in ems of the surrounding text. */
export function renderedMathHeight(tex: string): number {
  const height = tex.split(/\\\\/u).reduce((sum, line) => sum + displayLineHeight(line), 0);
  return Math.round(height * 10) / 10;
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
  return {
    type: 'element',
    tagName: 'div',
    properties: {
      ariaHidden: 'true',
      className: ['rounded-[3px]', 'bg-muted-foreground/10'],
      dataMathPending: 'display',
      style: `margin:1em auto;height:${renderedMathHeight(tex)}em;width:min(100%,${renderedMathWidth(tex)}ch)`,
    },
    children: [],
  };
}

function isMath(node: HastNode | undefined): boolean {
  const own = node?.tagName === 'code' ? classes(node) : [];
  return (
    own.includes('language-math') || own.includes('math-inline') || own.includes('math-display')
  );
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
