import { useEffect, useMemo, useRef, useState } from 'react';
import type { BundledLanguage, GrammarState, ThemedToken } from 'shiki';
import {
  highlightCode,
  tokenizeLines,
  type TokenizedChunk,
} from '@/components/ai-elements/code-block';
import { isLargeSource } from '@/lib/source-window';

/** A large file colours only its first lines; the rest read as plain text. */
export const HIGHLIGHT_MAX_LINES = 20_000;

const highlightable = (language: BundledLanguage | undefined): language is BundledLanguage =>
  // `languageForPath` names plain text 'text', which Shiki leaves uncoloured anyway.
  language !== undefined && (language as string) !== 'text';

/** Theme-coloured tokens per line of a short excerpt; undefined (plain) until Shiki loads. */
export function useHighlightedTokens(
  code: string,
  language: BundledLanguage | undefined,
): ThemedToken[][] | undefined {
  const enabled = highlightable(language) && code !== '' && !isLargeSource(code);
  // A cached result reads synchronously, so a remounted card never flashes plain.
  const cached = useMemo(
    () => (enabled ? highlightCode(code, language)?.tokens : undefined),
    [code, enabled, language],
  );
  const [state, setState] = useState<{
    code: string;
    language: BundledLanguage;
    tokens: ThemedToken[][];
  }>();
  useEffect(() => {
    if (!enabled || cached) return;
    let live = true;
    highlightCode(code, language, (result) => {
      if (live) setState({ code, language, tokens: result.tokens });
    });
    return () => {
      live = false;
    };
  }, [cached, code, enabled, language]);
  if (!enabled) return undefined;
  return cached ?? (state?.code === code && state.language === language ? state.tokens : undefined);
}

interface ChunkedTokens {
  language: BundledLanguage;
  lines: readonly string[];
  tokens: ThemedToken[][];
  /** Grammar state at each chunk's first line, keyed by line index. */
  states: Map<number, GrammarState | undefined>;
}

/**
 * Tokens for a windowed source list, filled a chunk at a time off the input path. A row
 * reads its tokens only while its text still matches, so growing windows never flash plain
 * and appended lines resume from the last unchanged chunk.
 */
export function useChunkedHighlight(
  lines: readonly string[],
  language: BundledLanguage | undefined,
): (index: number) => ThemedToken[] | undefined {
  const [highlighted, setHighlighted] = useState<ChunkedTokens>();
  const previous = useRef<ChunkedTokens | undefined>(undefined);
  const enabled = highlightable(language);
  useEffect(() => {
    if (!enabled) return;
    const capped = lines.length > HIGHLIGHT_MAX_LINES ? lines.slice(0, HIGHLIGHT_MAX_LINES) : lines;
    const prior = previous.current?.language === language ? previous.current : undefined;
    // Resume at the last chunk whose lines before it are unchanged.
    let from = 0;
    let state: GrammarState | undefined;
    if (prior) {
      let same = 0;
      const limit = Math.min(prior.lines.length, capped.length);
      while (same < limit && prior.lines[same] === capped[same]) same += 1;
      for (const [start, chunkState] of prior.states)
        if (start <= same && start > from && prior.tokens[start - 1] !== undefined) {
          from = start;
          state = chunkState;
        }
    }
    const next: ChunkedTokens = {
      language,
      lines: capped,
      tokens: prior ? prior.tokens.slice(0, from) : [],
      states: new Map(prior ? [...prior.states].filter(([start]) => start <= from) : []),
    };
    const signal = { cancelled: false };
    const apply = (chunks: TokenizedChunk[]) => {
      for (const chunk of chunks) {
        chunk.tokens.forEach((line, offset) => {
          next.tokens[chunk.start + offset] = line;
        });
        next.states.set(chunk.start + chunk.tokens.length, chunk.state);
      }
      previous.current = next;
      setHighlighted({ ...next });
    };
    tokenizeLines(capped, language, apply, signal, from, state).catch(() => {
      // Plain lines stay; colour is not needed to read the source.
    });
    return () => {
      signal.cancelled = true;
    };
  }, [enabled, language, lines]);
  return (index) => {
    if (!enabled || highlighted?.language !== language || highlighted.lines[index] !== lines[index])
      return undefined;
    return highlighted.tokens[index];
  };
}
