'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { copyText } from '@/lib/clipboard';
import { splitIndent } from '@/lib/source-indent';
import { CheckIcon, CopyIcon } from 'lucide-react';
import type { ComponentProps, CSSProperties, HTMLAttributes } from 'react';
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  BundledLanguage,
  BundledTheme,
  GrammarState,
  HighlighterGeneric,
  ThemedToken,
} from 'shiki';
import { t } from '@lingui/core/macro';

// Shiki uses bitflags for font styles: 1=italic, 2=bold, 4=underline
// oxlint-disable-next-line eslint(no-bitwise)
const isItalic = (fontStyle: number | undefined) => fontStyle && fontStyle & 1;
// oxlint-disable-next-line eslint(no-bitwise)
const isBold = (fontStyle: number | undefined) => fontStyle && fontStyle & 2;
const isUnderline = (fontStyle: number | undefined) =>
  // oxlint-disable-next-line eslint(no-bitwise)
  fontStyle && fontStyle & 4;

// Transform tokens to include pre-computed keys to avoid noArrayIndexKey lint
interface KeyedToken {
  token: ThemedToken;
  key: string;
}
interface KeyedLine {
  tokens: KeyedToken[];
  key: string;
}

const addKeysToTokens = (lines: ThemedToken[][]): KeyedLine[] =>
  lines.map((line, lineIdx) => ({
    key: `line-${lineIdx}`,
    tokens: line.map((token, tokenIdx) => ({
      key: `line-${lineIdx}-${tokenIdx}`,
      token,
    })),
  }));

// Token rendering component
export const TokenSpan = ({ token }: { token: ThemedToken }) => (
  <span
    style={
      {
        backgroundColor: token.bgColor,
        color: token.color,
        fontStyle: isItalic(token.fontStyle) ? 'italic' : undefined,
        fontWeight: isBold(token.fontStyle) ? 'bold' : undefined,
        textDecoration: isUnderline(token.fontStyle) ? 'underline' : undefined,
        ...token.htmlStyle,
      } as CSSProperties
    }
  >
    {token.content}
  </span>
);

// Line number styles using CSS counters
const LINE_NUMBER_CLASSES = cn(
  'block',
  'before:content-[counter(line)]',
  'before:inline-block',
  'before:[counter-increment:line]',
  'before:w-8',
  'before:mr-4',
  'before:text-right',
  'before:text-muted-foreground/50',
  'before:font-mono',
  'before:select-none',
);

// Line rendering component. The indent is unbreakable and exposed as `--indent`
// so a wrapping view can hang continuation rows at the line's own indent.
const LineSpan = ({
  keyedLine,
  showLineNumbers,
  diff,
}: {
  keyedLine: KeyedLine;
  showLineNumbers: boolean;
  diff: boolean;
}) => {
  const { lead, columns, rest } = splitIndent(keyedLine.tokens.map(({ token }) => token));
  return (
    <span
      className={showLineNumbers ? LINE_NUMBER_CLASSES : 'block'}
      style={columns ? ({ '--indent': `${columns}ch` } as CSSProperties) : undefined}
      data-diff-line={
        diff ? diffLineKind(keyedLine.tokens.map(({ token }) => token.content).join('')) : undefined
      }
    >
      {keyedLine.tokens.length === 0 ? (
        '\n'
      ) : (
        <>
          {lead && (
            <span className="whitespace-pre" data-indent="">
              {lead}
            </span>
          )}
          {rest.map((token, index) => (
            // oxlint-disable-next-line react/no-array-index-key -- tokens are positional.
            <TokenSpan key={`${keyedLine.key}-${index}`} token={token} />
          ))}
        </>
      )}
    </span>
  );
};

/**
 * Wrapped numbered lines hang past the line numbers and the line's own indent, so a
 * number marks only its own line and continuation rows keep the indent. The number
 * and the indent sit outside the inline flow, so a row never breaks before the
 * line's first word.
 */
export const HANGING_SOURCE_WRAP =
  '[&_pre]:whitespace-pre-wrap [&_pre]:[overflow-wrap:anywhere] [&_pre_code>span]:relative [&_pre_code>span]:min-h-[1.65em] [&_pre_code>span]:[padding-left:calc(3rem_+_var(--indent,0ch))] [&_pre_code>span]:before:absolute [&_pre_code>span]:before:left-0 [&_pre_code>span>[data-indent]]:absolute';

/** Classify unified-diff syntax, not tool names or model result keys. */
function diffLineKind(line: string): string {
  if (line.startsWith('--- ') || line.startsWith('+++ ') || line.startsWith('@@')) return 'header';
  if (line.startsWith('+')) return 'addition';
  if (line.startsWith('-')) return 'deletion';
  return 'context';
}

// Types
type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
  code: string;
  language: BundledLanguage;
  showLineNumbers?: boolean;
  /** The number of the first line when the code is a range of a larger file. */
  startLine?: number;
};

interface TokenizedCode {
  tokens: ThemedToken[][];
  fg: string;
  bg: string;
}

interface CodeBlockContextType {
  code: string;
}

// Context
const CodeBlockContext = createContext<CodeBlockContextType>({
  code: '',
});

// Highlighter cache (singleton per language)
const highlighterCache = new Map<
  string,
  Promise<HighlighterGeneric<BundledLanguage, BundledTheme>>
>();

// Token cache
const tokensCache = new Map<string, TokenizedCode>();

// Subscribers for async token updates
const subscribers = new Map<string, Set<(result: TokenizedCode) => void>>();

const getTokensCacheKey = (code: string, language: BundledLanguage) => {
  const start = code.slice(0, 100);
  const end = code.length > 100 ? code.slice(-100) : '';
  return `${language}:${code.length}:${start}:${end}`;
};

// Shiki loads on first highlight so it stays out of the initial bundle; raw
// tokens render until it arrives. Token colors are `var(--syntax-*)`
// references, so highlighting follows the active theme
// (web/src/theme/themes.css) without re-tokenizing.
const createLazyHighlighter = async (language: BundledLanguage) => {
  const { createCssVariablesTheme, createHighlighter } = await import('shiki');
  const theme = createCssVariablesTheme({
    name: 'clio-syntax',
    variablePrefix: '--syntax-',
    variableDefaults: {},
    fontStyle: true,
  });
  theme.tokenColors = [...(theme.tokenColors ?? []), ...MARKDOWN_TOKEN_COLORS];
  return createHighlighter({ langs: [language], themes: [theme] });
};

/**
 * Markdown's structure in the same syntax colours code uses. Shiki's variables
 * theme leaves headings, list markers and quotes in the text colour.
 */
const MARKDOWN_TOKEN_COLORS = [
  {
    scope: [
      'markup.heading',
      'entity.name.section.markdown',
      'punctuation.definition.heading.markdown',
    ],
    settings: { foreground: 'var(--syntax-token-keyword)' },
  },
  {
    scope: ['punctuation.definition.list.begin.markdown'],
    settings: { foreground: 'var(--syntax-token-constant)' },
  },
  { scope: ['markup.quote'], settings: { foreground: 'var(--syntax-token-comment)' } },
  {
    scope: [
      'punctuation.definition.bold.markdown',
      'punctuation.definition.italic.markdown',
      'punctuation.definition.quote.begin.markdown',
      'punctuation.definition.table.markdown',
      'meta.separator.markdown',
    ],
    settings: { foreground: 'var(--syntax-token-punctuation)' },
  },
];

const getHighlighter = (
  language: BundledLanguage,
): Promise<HighlighterGeneric<BundledLanguage, BundledTheme>> => {
  const cached = highlighterCache.get(language);
  if (cached) {
    return cached;
  }

  const highlighterPromise = createLazyHighlighter(language);

  highlighterCache.set(language, highlighterPromise);
  return highlighterPromise;
};

// Create raw tokens for immediate display while highlighting loads
const createRawTokens = (code: string): TokenizedCode => ({
  bg: 'transparent',
  fg: 'inherit',
  tokens: code.split('\n').map((line) =>
    line === ''
      ? []
      : [
          {
            color: 'inherit',
            content: line,
          } as ThemedToken,
        ],
  ),
});

// Synchronous highlight with callback for async results
export const highlightCode = (
  code: string,
  language: BundledLanguage,
  // oxlint-disable-next-line eslint-plugin-promise(prefer-await-to-callbacks)
  callback?: (result: TokenizedCode) => void,
): TokenizedCode | null => {
  const tokensCacheKey = getTokensCacheKey(code, language);

  // Return cached result if available
  const cached = tokensCache.get(tokensCacheKey);
  if (cached) {
    return cached;
  }

  // Subscribe callback if provided
  if (callback) {
    if (!subscribers.has(tokensCacheKey)) {
      subscribers.set(tokensCacheKey, new Set());
    }
    subscribers.get(tokensCacheKey)?.add(callback);
  }

  // Start highlighting in background - fire-and-forget async pattern
  getHighlighter(language)
    // oxlint-disable-next-line eslint-plugin-promise(prefer-await-to-then)
    .then((highlighter) => {
      const availableLangs = highlighter.getLoadedLanguages();
      const langToUse = availableLangs.includes(language) ? language : 'text';

      const result = highlighter.codeToTokens(code, {
        lang: langToUse,
        theme: 'clio-syntax',
      });

      const tokenized: TokenizedCode = {
        bg: result.bg ?? 'transparent',
        fg: result.fg ?? 'inherit',
        tokens: result.tokens,
      };

      // Cache the result
      tokensCache.set(tokensCacheKey, tokenized);

      // Notify all subscribers
      const subs = subscribers.get(tokensCacheKey);
      if (subs) {
        for (const sub of subs) {
          sub(tokenized);
        }
        subscribers.delete(tokensCacheKey);
      }
    })
    // oxlint-disable-next-line eslint-plugin-promise(prefer-await-to-then), eslint-plugin-promise(prefer-await-to-callbacks)
    .catch((error) => {
      console.error('Failed to highlight code:', error);
      subscribers.delete(tokensCacheKey);
    });

  return null;
};

/** Lines longer than this keep one plain token; minified rows would stall the tokenizer. */
const CHUNKED_MAX_LINE_LENGTH = 1_000;
/** Main-thread time spent tokenizing before yielding to input and paint. Unit: ms. */
const CHUNKED_FRAME_BUDGET_MS = 8;
const CHUNKED_LINES = 100;

export interface TokenizedChunk {
  /** Index of the first line in `tokens`. */
  start: number;
  tokens: ThemedToken[][];
  /** The grammar state after the chunk's last line, to resume tokenizing from it. */
  state?: GrammarState;
}

/**
 * Tokenize many lines a chunk at a time, yielding between frame budgets so a large
 * file stays responsive. Resumes at `from` with the grammar `state` there.
 */
export async function tokenizeLines(
  lines: readonly string[],
  language: BundledLanguage,
  // oxlint-disable-next-line eslint-plugin-promise(prefer-await-to-callbacks)
  onChunks: (chunks: TokenizedChunk[]) => void,
  signal: { cancelled: boolean },
  from = 0,
  state?: GrammarState,
): Promise<void> {
  const highlighter = await getHighlighter(language);
  if (signal.cancelled || !highlighter.getLoadedLanguages().includes(language)) return;
  let grammarState = state;
  let pending: TokenizedChunk[] = [];
  let frameStart = performance.now();
  for (let start = from; start < lines.length; start += CHUNKED_LINES) {
    if (signal.cancelled) return;
    const result = highlighter.codeToTokens(lines.slice(start, start + CHUNKED_LINES).join('\n'), {
      lang: language,
      theme: 'clio-syntax',
      grammarState,
      tokenizeMaxLineLength: CHUNKED_MAX_LINE_LENGTH,
    });
    grammarState = result.grammarState;
    pending.push({ start, tokens: result.tokens, state: grammarState });
    if (performance.now() - frameStart >= CHUNKED_FRAME_BUDGET_MS) {
      onChunks(pending);
      pending = [];
      // oxlint-disable-next-line eslint-plugin-promise(avoid-new)
      await new Promise((resolve) => setTimeout(resolve, 0));
      frameStart = performance.now();
    }
  }
  if (!signal.cancelled && pending.length) onChunks(pending);
}

const CodeBlockBody = memo(
  ({
    tokenized,
    showLineNumbers,
    startLine = 1,
    className,
    diff,
  }: {
    tokenized: TokenizedCode;
    showLineNumbers: boolean;
    startLine?: number;
    className?: string;
    diff: boolean;
  }) => {
    const preStyle = useMemo(
      () => ({
        backgroundColor: tokenized.bg,
        color: tokenized.fg,
      }),
      [tokenized.bg, tokenized.fg],
    );

    const keyedLines = useMemo(() => addKeysToTokens(tokenized.tokens), [tokenized.tokens]);

    return (
      <pre
        className={cn(
          'm-0 w-full min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere] p-4 text-sm',
          className,
        )}
        style={preStyle}
      >
        <code
          className={cn(
            'font-mono text-sm',
            showLineNumbers && '[counter-increment:line_0] [counter-reset:line]',
          )}
          style={
            showLineNumbers && startLine > 1
              ? {
                  // i18n-ignore: CSS counter name
                  counterReset: `line ${startLine - 1}`,
                }
              : undefined
          }
        >
          {keyedLines.map((keyedLine) => (
            <LineSpan
              key={keyedLine.key}
              keyedLine={keyedLine}
              showLineNumbers={showLineNumbers}
              diff={diff}
            />
          ))}
        </code>
      </pre>
    );
  },
  (prevProps, nextProps) =>
    prevProps.tokenized === nextProps.tokenized &&
    prevProps.showLineNumbers === nextProps.showLineNumbers &&
    prevProps.startLine === nextProps.startLine &&
    prevProps.diff === nextProps.diff &&
    prevProps.className === nextProps.className,
);

CodeBlockBody.displayName = 'CodeBlockBody';

export const CodeBlockContainer = ({
  className,
  language,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & { language: string }) => (
  <div
    className={cn(
      'group relative flex min-w-0 flex-col overflow-hidden rounded-md border bg-background text-foreground',
      className,
    )}
    data-language={language}
    style={{
      containIntrinsicSize: 'auto 200px',
      contentVisibility: 'auto',
      ...style,
    }}
    {...props}
  />
);

export const CodeBlockHeader = ({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex items-center justify-between border-b bg-muted/80 px-3 py-2 text-muted-foreground text-xs',
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

export const CodeBlockTitle = ({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex min-w-0 items-center gap-2', className)} {...props}>
    {children}
  </div>
);

export const CodeBlockFilename = ({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('min-w-0 truncate font-mono', className)} {...props}>
    {children}
  </span>
);

export const CodeBlockActions = ({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('-my-1 -mr-1 flex items-center gap-2', className)} {...props}>
    {children}
  </div>
);

export const CodeBlockContent = ({
  code,
  language,
  showLineNumbers = false,
  startLine,
}: {
  code: string;
  language: BundledLanguage;
  showLineNumbers?: boolean;
  startLine?: number;
}) => {
  // A final newline is part of the file format, not another visible code row.
  // Keep `code` unchanged in CodeBlockContext for copying and technical detail,
  // but omit that synthetic empty row from the rendered preview.
  const displayCode = useMemo(() => code.replace(/\r?\n$/u, ''), [code]);
  // Memoized raw tokens for immediate display
  const rawTokens = useMemo(() => createRawTokens(displayCode), [displayCode]);

  // Synchronous cache lookup — avoids setState in effect for cached results
  const syncTokens = useMemo(
    () => highlightCode(displayCode, language) ?? rawTokens,
    [displayCode, language, rawTokens],
  );

  // Async highlighting result (populated after shiki loads)
  const [asyncTokens, setAsyncTokens] = useState<TokenizedCode | null>(null);
  const asyncKeyRef = useRef({ code: displayCode, language });

  // Invalidate stale async tokens synchronously during render
  if (asyncKeyRef.current.code !== displayCode || asyncKeyRef.current.language !== language) {
    asyncKeyRef.current = { code: displayCode, language };
    setAsyncTokens(null);
  }

  useEffect(() => {
    let cancelled = false;

    highlightCode(displayCode, language, (result) => {
      if (!cancelled) {
        setAsyncTokens(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [displayCode, language]);

  const tokenized = asyncTokens ?? syncTokens;

  return (
    <div
      className="relative min-h-0 flex-1 overflow-auto focus-visible:outline focus-visible:outline-ring"
      data-slot="code-block-scroll"
      role="region"
      aria-label={t`Scrollable code`}
      tabIndex={0}
    >
      <CodeBlockBody
        showLineNumbers={showLineNumbers}
        startLine={startLine}
        tokenized={tokenized}
        diff={language === 'diff'}
      />
    </div>
  );
};

export const CodeBlock = ({
  code,
  language,
  showLineNumbers = false,
  startLine,
  className,
  children,
  ...props
}: CodeBlockProps) => {
  const contextValue = useMemo(() => ({ code }), [code]);

  return (
    <CodeBlockContext.Provider value={contextValue}>
      <CodeBlockContainer className={className} language={language} {...props}>
        {children}
        <CodeBlockContent
          code={code}
          language={language}
          showLineNumbers={showLineNumbers}
          startLine={startLine}
        />
      </CodeBlockContainer>
    </CodeBlockContext.Provider>
  );
};

export type CodeBlockCopyButtonProps = ComponentProps<typeof Button> & {
  onCopy?: () => void;
  onError?: (error: Error) => void;
  timeout?: number;
  /** What Copy copies when it differs from the text shown (default: the shown text). */
  value?: string;
};

export const CodeBlockCopyButton = ({
  onCopy,
  onError,
  timeout = 2000,
  value,
  children,
  className,
  ...props
}: CodeBlockCopyButtonProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef<number>(0);
  const { code } = useContext(CodeBlockContext);

  const copyToClipboard = useCallback(async () => {
    if (typeof window === 'undefined') {
      onError?.(new Error('Clipboard API not available'));
      return;
    }

    try {
      if (!isCopied) {
        await copyText(value ?? code);
        setIsCopied(true);
        onCopy?.();
        timeoutRef.current = window.setTimeout(() => setIsCopied(false), timeout);
      }
    } catch (error) {
      onError?.(error as Error);
    }
  }, [code, value, onCopy, onError, timeout, isCopied]);

  useEffect(
    () => () => {
      window.clearTimeout(timeoutRef.current);
    },
    [],
  );

  const Icon = isCopied ? CheckIcon : CopyIcon;

  return (
    <Button
      className={cn('shrink-0', className)}
      onClick={copyToClipboard}
      size="icon"
      variant="ghost"
      {...props}
    >
      {children ?? <Icon size={14} />}
    </Button>
  );
};
