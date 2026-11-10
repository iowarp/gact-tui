import { useEffect, useState, type CSSProperties } from 'react';
import type { highlightCode } from '@/components/ai-elements/code-block';

export { jsonLine } from './json-line';

/* The ask card's code preview parts: wrap marks and JSON and Python colouring. */

/** A hook arrow (↪) tiled once per line box down the gutter of a wrapped line. */
export const WRAP_MARKS: CSSProperties = {
  maskImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m15 10 5 5-5 5'/%3E%3Cpath d='M4 4v7a4 4 0 0 0 4 4h12'/%3E%3C/svg%3E\")",
  maskPosition: 'right 12px top',
  maskRepeat: 'repeat-y',
  maskSize: '9px 1.65em',
};

type HighlightedLines = NonNullable<ReturnType<typeof highlightCode>>['tokens'];

/** Theme-coloured tokens for a script, loaded with the shared highlighter; plain text until then. */
export function useHighlightedLines(code: string, language?: string): HighlightedLines | undefined {
  const [state, setState] = useState<{ code: string; lines: HighlightedLines }>();
  useEffect(() => {
    if (language !== 'python') return;
    let live = true;
    const apply = (lines: HighlightedLines) => {
      if (live) setState({ code, lines });
    };
    const load = async () => {
      try {
        const { highlightCode: highlight } = await import('@/components/ai-elements/code-block');
        const cached = highlight(code, language, (result) => apply(result.tokens));
        if (cached) apply(cached.tokens);
      } catch {
        // Plain lines stay; colour is not needed to read the script.
      }
    };
    void load();
    return () => {
      live = false;
    };
  }, [code, language]);
  return state?.code === code ? state.lines : undefined;
}
