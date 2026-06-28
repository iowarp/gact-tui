/**
 * ContextUsageBar — ONE continuous Claude `/context`-style segmented bar: a
 * single horizontal track split into proportional colored blocks, one per
 * category in a stable order, with the auto-compaction threshold marked on the
 * bar. Optionally renders the header line (used/window absolute + overall %) and
 * the category legend.
 *
 * Pure presentational: the caller owns fetching the {@link ContextState}. The
 * proportion math + fullness fallback live in {@link ContextUsageModel}.
 */
import { For, Show } from 'solid-js';
import type { ContextState } from '@clio/core';
import { formatCount } from '../formatters.js';
import {
  autocompactMarkerPct,
  categoryTotal,
  contextSegments,
  contextTone,
  fullnessFraction,
  usedTokensAbsolute,
} from './ContextUsageModel.js';
import './context-usage.css';

export interface ContextUsageBarProps {
  state: ContextState;
  /** Render the header line (absolute + overall %). Default true. */
  showHeader?: boolean;
  /** Render the per-category legend below the bar. Default false. */
  showLegend?: boolean;
  /** Thinner track for footer/inline placements. Default false. */
  mini?: boolean;
  /** data-testid for the bar root. */
  testid?: string;
}

function pctLabel(fraction: number | null): string {
  if (fraction == null) return '—';
  return `${Math.round(fraction * 100)}%`;
}

export function ContextUsageBar(props: ContextUsageBarProps) {
  const segments = () => contextSegments(props.state.categories);
  const fullness = () => fullnessFraction(props.state);
  const tone = () => contextTone(fullness(), props.state.autocompact_pct);
  const marker = () => autocompactMarkerPct(props.state);
  const total = () => categoryTotal(props.state.categories);
  const absUsed = () => usedTokensAbsolute(props.state);

  return (
    <div class="ctx-bar" data-testid={props.testid ?? 'context-usage-bar'}>
      <Show when={props.showHeader !== false}>
        <div class="ctx-bar__head">
          <span class="ctx-bar__abs" data-testid="context-usage-abs">
            {formatCount(absUsed())}
            {props.state.window_tokens > 0
              ? ` / ${formatCount(props.state.window_tokens)} tokens`
              : ' tokens'}
          </span>
          <span
            class={'ctx-bar__pct ctx-bar__pct--' + tone()}
            data-testid="context-usage-pct"
          >
            {pctLabel(fullness())}
          </span>
        </div>
      </Show>

      <div
        class={'ctx-bar__track' + (props.mini ? ' ctx-bar__track--mini' : '')}
        role="img"
        aria-label={`context usage ${pctLabel(fullness())}, ${formatCount(total())} attributed tokens across ${segments().length} categories`}
        data-testid="context-usage-track"
      >
        <Show
          when={segments().length > 0}
          fallback={<div class="ctx-bar__empty" />}
        >
          <For each={segments()}>
            {(block) => (
              <div
                class={'ctx-bar__block ' + block.colorClass}
                style={`width:${block.widthPct}%`}
                title={`${block.label}: ${formatCount(block.tokens)} (${Math.round(block.fraction * 100)}%)`}
                data-testid={`context-usage-block-${block.key}`}
                data-width={block.widthPct.toFixed(2)}
              />
            )}
          </For>
        </Show>
        <Show when={marker() != null}>
          <div
            class="ctx-bar__marker"
            style={`left:${marker()}%`}
            data-testid="context-usage-marker"
            title={`auto-compaction at ${Math.round((props.state.autocompact_pct ?? 0) * 100)}%`}
          >
            <Show when={!props.mini}>
              <span class="ctx-bar__marker-cap">auto</span>
            </Show>
          </div>
        </Show>
      </div>

      <Show when={props.showLegend}>
        <ul class="ctx-legend" data-testid="context-usage-legend">
          <For each={segments()}>
            {(block) => (
              <li class="ctx-legend__row" data-testid={`context-legend-${block.key}`}>
                <span class={'ctx-legend__pip ' + block.colorClass} />
                <span class="ctx-legend__name">{block.label}</span>
                <span class="ctx-legend__tokens">{formatCount(block.tokens)}</span>
                <span class="ctx-legend__pct">
                  {Math.round(block.fraction * 100)}%
                </span>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
