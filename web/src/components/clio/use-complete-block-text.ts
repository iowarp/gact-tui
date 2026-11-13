import type { ToolPresentationBlock } from '@clio/core/v3';
import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '@lingui/core/macro';
import { useRepository } from '@/hooks/use-repository';

/** Output up to this size loads in full when the script opens; larger output waits to be asked. */
export const AUTO_LOAD_CHARS = 64 * 1024;

export interface CompleteBlockText {
  text: string;
  /** Characters still on the agent, when the block arrived as a preview. */
  remaining: number;
  loading: boolean;
  error: string;
  loadAll: () => void;
}

/**
 * A presentation block's whole text. The agent sends long text as a preview plus
 * `content_ref`; this pages the rest in, at once for modest output and on request
 * beyond AUTO_LOAD_CHARS.
 */
export function useCompleteBlockText(block: ToolPresentationBlock | undefined): CompleteBlockText {
  const repository = useRepository();
  const ref = block?.content_ref;
  const [state, setState] = useState(() => ({
    text: block?.text ?? '',
    cursor: ref?.cursor ?? null,
  }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const loadAll = useCallback(() => {
    if (!ref || state.cursor === null || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    void (async () => {
      let next: number | null = state.cursor;
      let text = state.text;
      try {
        while (next !== null && !controller.signal.aborted) {
          const page = await repository.toolPresentationContent(
            ref.session_id,
            ref.call_id,
            ref.block_id,
            next,
            controller.signal,
            ref.result_sha256,
          );
          if (page.cursor !== next || (page.next_cursor !== null && page.next_cursor <= next))
            throw new Error('Invalid result content cursor');
          text += page.text;
          next = page.next_cursor;
        }
        if (!controller.signal.aborted) setState({ text, cursor: next });
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : t`Unable to load the rest`);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
        if (request.current === controller) request.current = null;
      }
    })();
  }, [ref, repository, state]);
  const total = ref?.total_chars ?? 0;
  const auto = state.cursor !== null && total <= AUTO_LOAD_CHARS;
  useEffect(() => {
    if (auto && !error) loadAll();
  }, [auto, error, loadAll]);
  const remaining = state.cursor === null ? 0 : Math.max(1, total - state.text.length);
  return { text: state.text, remaining, loading, error, loadAll };
}
