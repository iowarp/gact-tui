import type { ThemedToken } from 'shiki';
import { bundledLanguages } from 'shiki/langs';
import type { CodeHighlighterPlugin, ThemeInput } from 'streamdown';
import { highlightCode } from '@/components/ai-elements/code-block';
import { resolveCodeLanguage } from '@/lib/code-language';
import { isLargeSource } from '@/lib/source-window';

type HighlightResult = NonNullable<ReturnType<CodeHighlighterPlugin['highlight']>>;

// Shiki uses bitflags for font styles: 1=italic, 2=bold, 4=underline
const fontStyle = (style: number | undefined): Record<string, string> => ({
  // oxlint-disable-next-line eslint(no-bitwise)
  ...(style && style & 1 ? { 'font-style': 'italic' } : {}),
  // oxlint-disable-next-line eslint(no-bitwise)
  ...(style && style & 2 ? { 'font-weight': 'bold' } : {}),
  // oxlint-disable-next-line eslint(no-bitwise)
  ...(style && style & 4 ? { 'text-decoration': 'underline' } : {}),
});

const toStreamdown = (tokens: ThemedToken[][]): HighlightResult => ({
  bg: 'transparent',
  fg: 'inherit',
  tokens: tokens.map((line) =>
    line.map((token) => ({
      content: token.content,
      color: token.color,
      offset: token.offset,
      htmlStyle: { ...fontStyle(token.fontStyle), ...(token.htmlStyle as Record<string, string>) },
    })),
  ),
});

// Token colours are `var(--syntax-*)` references, so one theme serves light and dark.
const THEME = 'clio-syntax' as unknown as ThemeInput;

/**
 * Chat code fences through the same highlighter and colours as code blocks, files and
 * scripts, including CLIO's own languages (` ```qasm `). An unknown or very large fence
 * stays plain text.
 */
export const markdownCode: CodeHighlighterPlugin = {
  name: 'shiki',
  type: 'code-highlighter',
  getThemes: () => [THEME, THEME],
  getSupportedLanguages: () => Object.keys(bundledLanguages) as never,
  supportsLanguage: (language) => resolveCodeLanguage(language) !== undefined,
  highlight: ({ code, language }, callback) => {
    const resolved = resolveCodeLanguage(language);
    if (!resolved || isLargeSource(code)) return null;
    const ready = highlightCode(code, resolved, (result) => callback?.(toStreamdown(result.tokens)));
    return ready ? toStreamdown(ready.tokens) : null;
  },
};
