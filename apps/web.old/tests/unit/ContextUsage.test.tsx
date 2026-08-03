import { cleanup, render, screen } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContextState } from '@clio/core';
import {
  autocompactMarkerPct,
  categoryTotal,
  contextSegments,
  contextTone,
  fullnessFraction,
  usedTokensAbsolute,
} from '../../src/components/ContextUsageModel.js';
import { ContextUsageBar } from '../../src/components/ContextUsageBar.js';
import { ContextFooter } from '../../src/components/ContextFooter.js';

afterEach(cleanup);

function baseState(over: Partial<ContextState> = {}): ContextState {
  return {
    session_id: 's1',
    scope: 'main',
    as_of: 0,
    window_tokens: 100_000,
    live_tokens: 40_000,
    pct_used: 0.4,
    used_tokens: 50_000,
    used_pct: 0.5,
    autocompact_pct: 0.85,
    live_block_count: 3,
    tokens_by_kind: {},
    categories: {},
    segments: [],
    render_text: '',
    render_keys: {},
    ...over,
  };
}

describe('contextSegments — proportion math + ordering', () => {
  it('normalizes widths to sum to 100 and computes legend fractions', () => {
    const segs = contextSegments({ system: 1000, messages: 3000 });
    expect(segs.map((s) => s.key)).toEqual(['system', 'messages']);
    const widthSum = segs.reduce((a, s) => a + s.widthPct, 0);
    expect(widthSum).toBeCloseTo(100, 6);
    const [system, messages] = segs;
    expect(system!.widthPct).toBeCloseTo(25, 6);
    expect(messages!.widthPct).toBeCloseTo(75, 6);
    expect(system!.fraction).toBeCloseTo(0.25, 6);
    expect(messages!.fraction).toBeCloseTo(0.75, 6);
  });

  it('orders categories by the stable display order with framing last', () => {
    const segs = contextSegments({
      framing: 500,
      messages: 1000,
      system: 200,
      tools: 300,
    });
    expect(segs.map((s) => s.key)).toEqual([
      'system',
      'messages',
      'tools',
      'framing',
    ]);
  });

  it('keeps the synthetic framing bucket as its own proportional block', () => {
    const segs = contextSegments({ messages: 9000, framing: 1000 });
    const framing = segs.find((s) => s.key === 'framing');
    expect(framing).toBeTruthy();
    expect(framing!.widthPct).toBeCloseTo(10, 6);
    expect(framing!.colorClass).toBe('ctx-cat--framing');
  });

  it('drops zero/negative buckets and returns empty when total is 0', () => {
    expect(contextSegments({ system: 0, messages: 0 })).toEqual([]);
    expect(contextSegments(undefined)).toEqual([]);
    const segs = contextSegments({ system: 100, messages: 0, tools: -5 });
    expect(segs.map((s) => s.key)).toEqual(['system']);
  });

  it('appends unknown categories before framing, alphabetically', () => {
    const segs = contextSegments({
      framing: 100,
      zeta: 100,
      alpha: 100,
      system: 100,
    });
    expect(segs.map((s) => s.key)).toEqual([
      'system',
      'alpha',
      'zeta',
      'framing',
    ]);
  });
});

describe('categoryTotal', () => {
  it('sums positive buckets only', () => {
    expect(categoryTotal({ a: 10, b: 20, c: 0, d: -3 })).toBe(30);
    expect(categoryTotal(undefined)).toBe(0);
  });
});

describe('fullnessFraction — used_pct preferred, pct_used fallback', () => {
  it('prefers used_pct when used_tokens is present', () => {
    expect(fullnessFraction(baseState())).toBeCloseTo(0.5, 6);
  });

  it('falls back to pct_used when used_tokens is null (between turns)', () => {
    const s = baseState({ used_tokens: null, used_pct: null, pct_used: 0.4 });
    expect(fullnessFraction(s)).toBeCloseTo(0.4, 6);
  });

  it('falls back to pct_used even if used_pct is set but used_tokens is null', () => {
    // Defensive: a stale used_pct with no used_tokens must not be trusted.
    const s = baseState({ used_tokens: null, used_pct: 0.9, pct_used: 0.4 });
    expect(fullnessFraction(s)).toBeCloseTo(0.4, 6);
  });

  it('returns null when neither measure is available', () => {
    const s = baseState({ used_tokens: null, used_pct: null, pct_used: null });
    expect(fullnessFraction(s)).toBeNull();
  });

  it('clamps to [0,1]', () => {
    expect(fullnessFraction(baseState({ used_pct: 1.4 }))).toBe(1);
    expect(
      fullnessFraction(baseState({ used_tokens: null, used_pct: null, pct_used: -0.2 })),
    ).toBe(0);
  });
});

describe('usedTokensAbsolute', () => {
  it('prefers used_tokens, falls back to live_tokens', () => {
    expect(usedTokensAbsolute(baseState())).toBe(50_000);
    expect(usedTokensAbsolute(baseState({ used_tokens: null }))).toBe(40_000);
  });
});

describe('autocompactMarkerPct', () => {
  it('maps the threshold onto the used/window fullness scale', () => {
    // fullness 0.5, threshold 0.85 -> 0.85/0.5 = 1.7 -> clamp 100
    expect(autocompactMarkerPct(baseState())).toBeCloseTo(100, 6);
    // fullness 0.9, threshold 0.45 -> 50% of the bar
    const s = baseState({ used_pct: 0.9, autocompact_pct: 0.45 });
    expect(autocompactMarkerPct(s)).toBeCloseTo(50, 6);
  });

  it('uses the raw threshold when there is no fullness reference', () => {
    const s = baseState({
      used_tokens: null,
      used_pct: null,
      pct_used: null,
      autocompact_pct: 0.85,
    });
    expect(autocompactMarkerPct(s)).toBeCloseTo(85, 6);
  });

  it('returns null when there is no threshold', () => {
    expect(autocompactMarkerPct(baseState({ autocompact_pct: null }))).toBeNull();
    expect(autocompactMarkerPct(baseState({ autocompact_pct: 0 }))).toBeNull();
  });
});

describe('contextTone', () => {
  it('buckets by fullness', () => {
    expect(contextTone(null)).toBe('idle');
    expect(contextTone(0.5)).toBe('ok');
    expect(contextTone(0.8)).toBe('warn');
    expect(contextTone(0.95)).toBe('err');
  });

  it('warns at the autocompact threshold when below 0.75', () => {
    expect(contextTone(0.6, 0.55)).toBe('warn');
    expect(contextTone(0.5, 0.55)).toBe('ok');
  });
});

describe('ContextUsageBar render', () => {
  it('renders one block per category with widths summing to 100 and a marker', () => {
    render(() => (
      <ContextUsageBar
        state={baseState({
          categories: { system: 1000, messages: 3000, framing: 1000 },
        })}
        showHeader
        showLegend
      />
    ));
    expect(screen.getByTestId('context-usage-block-system')).toBeTruthy();
    expect(screen.getByTestId('context-usage-block-messages')).toBeTruthy();
    expect(screen.getByTestId('context-usage-block-framing')).toBeTruthy();
    expect(screen.getByTestId('context-usage-marker')).toBeTruthy();

    const widths = ['system', 'messages', 'framing'].map((k) =>
      parseFloat(
        screen.getByTestId(`context-usage-block-${k}`).getAttribute('data-width') ?? '0',
      ),
    );
    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 4);

    // Header shows the model-grounded 50% and the absolute used_tokens.
    expect(screen.getByTestId('context-usage-pct').textContent).toContain('50%');
    expect(screen.getByTestId('context-usage-legend')).toBeTruthy();
  });

  it('falls back to pct_used in the header when used_tokens is null', () => {
    render(() => (
      <ContextUsageBar
        state={baseState({
          used_tokens: null,
          used_pct: null,
          pct_used: 0.4,
          categories: { messages: 1000 },
        })}
        showHeader
      />
    ));
    expect(screen.getByTestId('context-usage-pct').textContent).toContain('40%');
  });

  it('renders an empty track with no marker when there are no categories', () => {
    render(() => (
      <ContextUsageBar
        state={baseState({ categories: {}, autocompact_pct: null })}
      />
    ));
    expect(screen.getByTestId('context-usage-track')).toBeTruthy();
    expect(screen.queryByTestId('context-usage-marker')).toBeNull();
  });
});

describe('ContextFooter', () => {
  it('waits for a resolved scope before requesting context state', async () => {
    const getContextState = vi.fn(async () => baseState());
    render(() => (
      <ContextFooter
        sessionId="s1"
        client={{
          getContextState,
          compactContext: vi.fn(),
          agents: vi.fn(async () => ({ agents: [{ id: 'main', name: 'main', title: 'main' }] })),
        }}
      />
    ));

    expect(getContextState).not.toHaveBeenCalledWith('s1', undefined);
    await screen.findByTestId('context-footer');
    expect(getContextState).toHaveBeenCalledWith('s1', 'main');
  });
});
