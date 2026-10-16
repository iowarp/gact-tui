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

/** Add standard LaTeX delimiters without rewriting saved messages or literal code. */
export function remarkStandardMath(this: Processor): void {
  const data = this.data();
  (data.micromarkExtensions ??= []).push(syntax);
  (data.fromMarkdownExtensions ??= []).push(ast);
}

/** Keep equations together when Streamdown's preliminary Markdown lexer splits them. */
export function parseMathMarkdownBlocks(markdown: string): string[] {
  const blocks = parseMarkdownIntoBlocks(markdown);
  if (blocks.length < 2 || !/\$|\\[([]/u.test(markdown)) return blocks;
  const tree = fromMarkdown(markdown, { extensions: [syntax], mdastExtensions: [ast] });
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
  if (blocks.join('') !== markdown) return [markdown];
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
