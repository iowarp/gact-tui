import {
  fromMarkdown,
  type Extension as MdastExtension,
  type Handle,
} from 'mdast-util-from-markdown';
import type {} from 'mdast-util-math';
import type { Construct, Extension, State, Tokenizer } from 'micromark-util-types';
import { parseMarkdownIntoBlocks } from 'streamdown';
import type { Processor } from 'unified';
import { inlineDollarMath } from './micromark-inline-dollar-math';

declare module 'unified' {
  interface Data {
    micromarkExtensions?: Extension[];
    fromMarkdownExtensions?: MdastExtension[];
  }
}

declare module 'micromark-util-types' {
  interface TokenTypeMap {
    clioInlineMath: 'clioInlineMath';
    clioDisplayMath: 'clioDisplayMath';
    clioMathBlock: 'clioMathBlock';
    clioMathData: 'clioMathData';
  }
}

/** Parse before Markdown escapes, so TeX remains opaque to emphasis, links and HTML. */
function mathConstruct(block: boolean): Construct {
  const tokenize: Tokenizer = function (effects, ok, nok) {
    let close: number;
    let tokenType: 'clioInlineMath' | 'clioDisplayMath' | 'clioMathBlock';
    let hasContent = false;

    const start: State = (code) => {
      effects.enter(block ? 'clioMathBlock' : 'clioInlineMath');
      effects.consume(code);
      return opening;
    };
    const opening: State = (code) => {
      if (code !== 91 && (block || code !== 40)) return nok(code);
      close = code === 91 ? 93 : 41;
      tokenType = block ? 'clioMathBlock' : code === 91 ? 'clioDisplayMath' : 'clioInlineMath';
      // The opening token is provisional until we know which delimiter follows.
      this.events[this.events.length - 1][1].type = tokenType;
      effects.consume(code);
      return content;
    };
    const content: State = (code) => {
      if (code === null) return nok(code);
      if (code === 92) {
        effects.enter('clioMathData');
        effects.consume(code);
        return afterSlash;
      }
      if (code === -5 || code === -4 || code === -3) {
        effects.enter('lineEnding');
        effects.consume(code);
        effects.exit('lineEnding');
        return content;
      }
      effects.enter('clioMathData');
      return data(code);
    };
    const data: State = (code) => {
      if (code === null || code === 92 || code === -5 || code === -4 || code === -3) {
        effects.exit('clioMathData');
        return content(code);
      }
      if (code > 32) hasContent = true;
      effects.consume(code);
      return data;
    };
    const afterSlash: State = (code) => {
      if (code === close) {
        if (!hasContent) return nok(code);
        effects.consume(code);
        effects.exit('clioMathData');
        return end;
      }
      // Nested openers are invalid TeX. Stop rather than repeatedly scanning
      // the remaining response for every unfinished opener while streaming.
      if (code === 40 || code === 91) return nok(code);
      if (code === null) return nok(code);
      if (code === -5 || code === -4 || code === -3) {
        effects.exit('clioMathData');
        return content(code);
      }
      hasContent = true;
      effects.consume(code); // Includes TeX's \\ line break, not a closing delimiter.
      return data;
    };
    const end: State = (code) => {
      if (block && (code === 32 || code === -2 || code === -1)) {
        effects.exit(tokenType);
        effects.enter('whitespace');
        return trailing(code);
      }
      if (block && code !== null && code !== -5 && code !== -4 && code !== -3) {
        return nok(code);
      }
      effects.exit(tokenType);
      return ok(code);
    };
    const trailing: State = (code) => {
      if (code === 32 || code === -2 || code === -1) {
        effects.consume(code);
        return trailing;
      }
      if (code !== null && code !== -5 && code !== -4 && code !== -3) return nok(code);
      effects.exit('whitespace');
      return ok(code);
    };
    return start;
  };
  return { name: block ? 'clioMathBlock' : 'clioStandardMath', concrete: block, tokenize };
}

const syntax: Extension = {
  text: { 36: inlineDollarMath(), 92: mathConstruct(false) },
  flow: { 92: mathConstruct(true) },
};

const enterMath: Handle = function (token) {
  const width = token.type === 'clioDollarMath' ? 1 : 2;
  const value = this.sliceSerialize(token).slice(width, -width).trim();
  const display = token.type !== 'clioInlineMath' && token.type !== 'clioDollarMath';
  const code = {
    type: 'element' as const,
    tagName: 'code',
    properties: { className: ['language-math', display ? 'math-display' : 'math-inline'] },
    children: [{ type: 'text' as const, value }],
  };
  this.enter(
    display
      ? {
          type: token.type === 'clioMathBlock' ? 'math' : 'inlineMath',
          value,
          // The sanitizer preserves pre/code structure but filters arbitrary
          // classes. KaTeX recognizes this as display math even inside prose.
          data: { hName: 'pre', hChildren: [code] },
        }
      : {
          type: 'inlineMath',
          value,
          data: { hName: 'code', hProperties: code.properties, hChildren: code.children },
        },
    token,
  );
  this.buffer();
};
const exitMath: Handle = function (token) {
  this.resume();
  this.exit(token);
};
const ast: MdastExtension = {
  enter: {
    clioDollarMath: enterMath,
    clioInlineMath: enterMath,
    clioDisplayMath: enterMath,
    clioMathBlock: enterMath,
  },
  exit: {
    clioDollarMath: exitMath,
    clioInlineMath: exitMath,
    clioDisplayMath: exitMath,
    clioMathBlock: exitMath,
  },
};

/**
 * Escape unmatched inline `$$` examples before remark-math scans prose.
 *
 * The remark-math text tokenizer treats an unmatched double-dollar marker as
 * an opener and can assert when it reaches another dollar later in the same
 * paragraph. Paired inline formulas and standalone display fences remain
 * untouched; code and ordinary single-dollar text are never rewritten.
 */
export function normalizeMathMarkdown(markdown: string): string {
  if (!markdown.includes('$$')) return markdown;

  const tree = fromMarkdown(markdown);
  const codeRanges: { start: number; end: number }[] = [];
  interface PositionedNode {
    type: string;
    position?: { start: { offset?: number }; end: { offset?: number } };
    children?: PositionedNode[];
  }
  const visit = (node: PositionedNode): void => {
    if (node.type === 'code' || node.type === 'inlineCode') {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start !== undefined && end !== undefined) codeRanges.push({ start, end });
    }
    node.children?.forEach(visit);
  };
  visit(tree);
  codeRanges.sort((left, right) => left.start - right.start);

  const lines = markdown.match(/[^\r\n]*(?:\r\n|\r|\n|$)/gu) ?? [markdown];
  const unmatched: { start: number; end: number }[] = [];
  let offset = 0;
  let paragraphStart: number | undefined;
  const collectParagraph = (paragraphEnd: number): void => {
    if (paragraphStart === undefined) return;
    const markers: { start: number; end: number }[] = [];
    let segmentStart = paragraphStart;
    for (const range of codeRanges) {
      if (range.end <= segmentStart) continue;
      if (range.start >= paragraphEnd) break;
      const codeStart = Math.max(segmentStart, range.start);
      collectDollarMarkers(markdown, segmentStart, codeStart, markers);
      segmentStart = Math.max(segmentStart, Math.min(paragraphEnd, range.end));
    }
    collectDollarMarkers(markdown, segmentStart, paragraphEnd, markers);
    if (markers.length % 2 === 1) unmatched.push(markers[markers.length - 1]);
    paragraphStart = undefined;
  };

  for (const line of lines) {
    const content = line.replace(/(?:\r\n|\r|\n)$/u, '');
    const lineOffset = offset;
    offset += line.length;
    if (/^\s*$/u.test(content) || isStandaloneMathFence(content)) {
      collectParagraph(lineOffset);
    } else if (paragraphStart === undefined) {
      paragraphStart = lineOffset;
    }
  }
  collectParagraph(markdown.length);

  for (let index = unmatched.length - 1; index >= 0; index--) {
    const marker = unmatched[index];
    markdown = `${markdown.slice(0, marker.start)}\\$\\$${markdown.slice(marker.end)}`;
  }
  return markdown;
}

function isStandaloneMathFence(line: string): boolean {
  let content = line.trimStart();
  for (let depth = 0; depth < 8; depth++) {
    const quote = content.match(/^>\s?/u);
    const listItem = content.match(/^(?:[-+*]|\d+[.)])[ \t]+/u);
    const prefix = quote ?? listItem;
    if (!prefix) break;
    content = content.slice(prefix[0].length).trimStart();
  }
  return content === '$$';
}

function collectDollarMarkers(
  markdown: string,
  start: number,
  end: number,
  output: { start: number; end: number }[],
): void {
  for (let index = start; index < end - 1; index++) {
    if (
      markdown[index] !== '$' ||
      markdown[index + 1] !== '$' ||
      markdown[index - 1] === '$' ||
      markdown[index + 2] === '$'
    ) {
      continue;
    }
    let backslashes = 0;
    for (let cursor = index - 1; cursor >= start && markdown[cursor] === '\\'; cursor--)
      backslashes++;
    if (backslashes % 2 === 0) output.push({ start: index, end: index + 2 });
    index++;
  }
}

/** Add standard LaTeX delimiters without rewriting saved messages or literal code. */
export function remarkStandardMath(this: Processor): void {
  const data = this.data();
  (data.micromarkExtensions ??= []).push(syntax);
  (data.fromMarkdownExtensions ??= []).push(ast);
}

/** Keep equations together when Streamdown's preliminary Markdown lexer splits them. */
export function parseMathMarkdownBlocks(markdown: string): string[] {
  const normalized = normalizeMathMarkdown(markdown);
  const blocks = parseMarkdownIntoBlocks(normalized);
  if (blocks.length < 2 || !/\$|\\[([]/u.test(normalized)) return blocks;
  const tree = fromMarkdown(normalized, { extensions: [syntax], mdastExtensions: [ast] });
  const ranges: { start: number; end: number }[] = [];
  interface MathNode {
    type: string;
    position?: { start: { offset?: number }; end: { offset?: number } };
    children?: MathNode[];
  }
  const visit = (node: MathNode): void => {
    if (node.type === 'math' || node.type === 'inlineMath') {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start !== undefined && end !== undefined) ranges.push({ start, end });
    }
    node.children?.forEach(visit);
  };
  visit(tree);
  if (!ranges.length) return blocks;
  // Marked currently preserves raw source. If that contract changes, avoid
  // inventing offsets and render the whole response with the real parser.
  if (blocks.join('') !== normalized) return [normalized];
  const merged: string[] = [];
  let offset = 0;
  let rangeIndex = 0;
  for (const block of blocks) {
    while (ranges[rangeIndex]?.end <= offset) rangeIndex++;
    const range = ranges[rangeIndex];
    if (range && range.start < offset && offset < range.end) merged[merged.length - 1] += block;
    else merged.push(block);
    offset += block.length;
  }
  return merged;
}
