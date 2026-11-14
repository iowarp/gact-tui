import type { AttentionAvailable, Message as DomainMessage, ToolInvocation } from '@clio/core/v3';
import { type RefObject, useLayoutEffect } from 'react';
import { adoptStyleSheet } from '@/lib/adopted-style-sheet';
import { buildSegmentHighlightRanges, buildSelectedRange } from '@/lib/attention-highlight-dom';
import {
  type AttentionHeatView,
  DEFAULT_ATTENTION_HEAT_VIEW,
  SEGMENT_HEAT_LEVELS,
} from '@/lib/attention-segment-heat';
import { findTextPartSource, resolveAttentionSources } from '@/lib/attention-highlight-sources';
import { contentRevision } from '@/lib/content-revision';

/** Every unit paints levels 1..9 of SPOTTER's ramps; level 0 stays unpainted. */
const SEGMENT_HIGHLIGHT_NAMES = Array.from(
  { length: SEGMENT_HEAT_LEVELS },
  (_, level) => `clio-attn-level-${level}`,
);
/** The same levels on the tool ramp: tool blocks and `>>>` tool calls written in text. */
const TOOL_HIGHLIGHT_NAMES = Array.from(
  { length: SEGMENT_HEAT_LEVELS },
  (_, level) => `clio-attn-tool-level-${level}`,
);
const SELECTED_HIGHLIGHT_NAME = 'clio-attn-selected';

/*
 * SPOTTER's text-map levels 1..9 (render_heatmap.py, render_pretoken_heatmap.py),
 * the same for lines, words and tokens, on two ramps: prompt text and tool calls,
 * so evidence a tool returned stands apart from instructions and earlier answers.
 * Level 0 is not painted; every painted level is also underlined in its ramp's
 * hue, so heat never rests on color alone, and the ink switches to the foreground
 * once the band is dark enough to need it. A Highlight's ranges can only be styled through a global
 * ::highlight() rule, and while any such rule exists every style recalculation
 * computes highlight styles for every element (about half the cost of opening
 * a menu on a long conversation). So the rules are mounted only while heat is
 * shown.
 */
/** The share of the ramp's hue at levels 0..9: distinct steps from the first level on. */
const LEVEL_MIX = [0, 22, 30, 39, 48, 56, 64, 73, 82, 90] as const;

function rampRules(names: readonly string[], hue: string): string[] {
  return names.slice(1).map((name, index) => {
    const level = index + 1;
    const ink = level >= 6 ? ' color: var(--foreground);' : '';
    return `::highlight(${name}) { background-color: color-mix(in oklch, var(${hue}) ${LEVEL_MIX[level]}%, transparent); text-decoration: underline; text-decoration-color: var(${hue}); text-decoration-thickness: 2px;${ink} }`;
  });
}

const HIGHLIGHT_RULES = [
  ...rampRules(SEGMENT_HIGHLIGHT_NAMES, '--attention-heat-text'),
  ...rampRules(TOOL_HIGHLIGHT_NAMES, '--attention-heat-tool'),
  `::highlight(${SELECTED_HIGHLIGHT_NAME}) { background-color: color-mix(in oklch, var(--primary) 22%, transparent); text-decoration: underline; text-decoration-color: color-mix(in oklch, var(--primary) 70%, transparent); text-decoration-thickness: 2px; }`,
].join('\n');

let unmountHighlightStyle: (() => void) | undefined;
let highlightStyleUsers = 0;

function retainHighlightStyle(): () => void {
  highlightStyleUsers += 1;
  unmountHighlightStyle ??= adoptStyleSheet(HIGHLIGHT_RULES, 'clio-attention-highlights');
  return () => {
    highlightStyleUsers -= 1;
    if (highlightStyleUsers > 0) return;
    unmountHighlightStyle?.();
    unmountHighlightStyle = undefined;
  };
}

function clearHighlights() {
  if (typeof CSS === 'undefined' || !CSS.highlights) return;
  for (const name of [...SEGMENT_HIGHLIGHT_NAMES, ...TOOL_HIGHLIGHT_NAMES]) {
    CSS.highlights.delete(name);
  }
  CSS.highlights.delete(SELECTED_HIGHLIGHT_NAME);
}

/**
 * Paints "Understand attention" heat over the live transcript DOM using the
 * CSS Custom Highlight API, so the markdown renderer never has to re-render
 * for it. `view.unit` chooses one band per source line (SPOTTER's text map,
 * the default), per first-level word, or per kept token, all on the same
 * levels. Re-applies on every transcript mutation (streaming text,
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
  view: AttentionHeatView = DEFAULT_ATTENTION_HEAT_VIEW,
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
    const selectedSource = data.selection.part_id
      ? findTextPartSource(messages, data.message_id, data.selection.part_id)
      : undefined;

    let frame = 0;
    const apply = () => {
      const { heat, toolHeat } = buildSegmentHighlightRanges(
        container,
        resolved,
        view.unit,
        view.reduction,
      );
      heat.forEach((ranges, level) => {
        CSS.highlights.set(SEGMENT_HIGHLIGHT_NAMES[level] as string, new Highlight(...ranges));
      });
      toolHeat.forEach((ranges, level) => {
        CSS.highlights.set(TOOL_HIGHLIGHT_NAMES[level] as string, new Highlight(...ranges));
      });
      const selectedRanges = data.selected_references?.flatMap((reference) => {
        if (reference.field !== 'text') return [];
        const source = findTextPartSource(messages, reference.message_id, reference.part_id);
        if (!source || contentRevision(source) !== reference.content_revision) return [];
        if (reference.selection.kind !== 'text' && reference.selection.kind !== 'whole') return [];
        const selection =
          reference.selection.kind === 'text'
            ? reference.selection
            : { start: 0, end: [...source].length };
        const range = buildSelectedRange(
          container,
          {
            ...data,
            message_id: reference.message_id,
            selection: {
              part_id: reference.part_id,
              field: reference.field,
              text: source,
              ...selection,
            },
          },
          source,
        );
        return range ? [range] : [];
      });
      const selectedRange = selectedRanges
        ? undefined
        : buildSelectedRange(container, data, selectedSource);
      CSS.highlights.set(
        SELECTED_HIGHLIGHT_NAME,
        new Highlight(...(selectedRanges ?? (selectedRange ? [selectedRange] : []))),
      );
    };
    const scheduleApply = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };

    scheduleApply();
    const releaseStyle = retainHighlightStyle();
    const observer = new MutationObserver(scheduleApply);
    observer.observe(container, { childList: true, subtree: true, characterData: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      clearHighlights();
      releaseStyle();
    };
  }, [containerRef, data, messages, tools, view]);
}
