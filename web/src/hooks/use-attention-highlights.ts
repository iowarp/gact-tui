import type { AttentionAvailable, Message as DomainMessage, ToolInvocation } from '@clio/core/v3';
import { type RefObject, useLayoutEffect } from 'react';
import { buildAttentionHighlightRanges, buildSelectedRange } from '@/lib/attention-highlight-dom';
import { findTextPartSource, resolveAttentionSources } from '@/lib/attention-highlight-sources';
import { maxRunValue } from '@/lib/attention-text';

const HEAT_LEVELS = 4;
const HEAT_HIGHLIGHT_NAMES = Array.from(
  { length: HEAT_LEVELS },
  (_, level) => `clio-attn-heat-${level}`,
);
const SELECTED_HIGHLIGHT_NAME = 'clio-attn-selected';

function clearHighlights() {
  if (typeof CSS === 'undefined' || !CSS.highlights) return;
  for (const name of HEAT_HIGHLIGHT_NAMES) CSS.highlights.delete(name);
  CSS.highlights.delete(SELECTED_HIGHLIGHT_NAME);
}

/**
 * Paints "Understand attention" heat over the live transcript DOM using the
 * CSS Custom Highlight API, so the markdown renderer never has to re-render
 * for it. Re-applies on every transcript mutation (streaming text,
 * virtualized rows mounting as the reader scrolls) while a result is shown;
 * clears every highlight when dismissed, when the container unmounts, or when
 * the browser has no Custom Highlight API support (Highlight is left `undefined`
 * and this becomes a no-op — the banner, breakdown, and tool badges still work
 * without it).
 */
export function useAttentionHighlights(
  containerRef: RefObject<HTMLElement | null>,
  data: AttentionAvailable | undefined,
  messages: readonly DomainMessage[],
  tools: Record<string, ToolInvocation>,
) {
  useLayoutEffect(() => {
    if (!data) return undefined;
    if (typeof CSS === 'undefined' || !CSS.highlights || typeof Highlight === 'undefined') {
      return undefined;
    }
    const container = containerRef.current;
    if (!container) return undefined;

    const heatData = data.profile
      ? {
          ...data,
          blocks: data.blocks.map((block) => ({ ...block, runs: block.display_runs ?? [] })),
        }
      : data;
    const resolved = resolveAttentionSources(heatData, messages, tools);
    const maxValue = data.profile ? 1 : maxRunValue(data.blocks);
    const selectedSource = data.selection.part_id
      ? findTextPartSource(messages, data.message_id, data.selection.part_id)
      : undefined;

    let frame = 0;
    const apply = () => {
      const { heat } = buildAttentionHighlightRanges(container, resolved, maxValue, HEAT_LEVELS);
      heat.forEach((ranges, level) => {
        CSS.highlights.set(HEAT_HIGHLIGHT_NAMES[level] as string, new Highlight(...ranges));
      });
      const selectedRange = buildSelectedRange(container, data, selectedSource);
      CSS.highlights.set(
        SELECTED_HIGHLIGHT_NAME,
        new Highlight(...(selectedRange ? [selectedRange] : [])),
      );
    };
    const scheduleApply = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };

    scheduleApply();
    const observer = new MutationObserver(scheduleApply);
    observer.observe(container, { childList: true, subtree: true, characterData: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      clearHighlights();
    };
  }, [containerRef, data, messages, tools]);
}
