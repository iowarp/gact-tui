import type { AttentionAvailable } from '@clio/core/v3';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAttentionHighlights } from './use-attention-highlights';

const data: AttentionAvailable = {
  available: true,
  message_id: 'msg_1',
  selection: { text: 'x' },
  residual: 0.5,
  sources: [],
  flags: [],
  blocks: [],
};

const highlightRules = () =>
  document.head.querySelectorAll('style[data-clio-attention-highlights]');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useAttentionHighlights', () => {
  it('mounts its ::highlight rules only while attention heat is shown', () => {
    vi.stubGlobal('CSS', { highlights: new Map() });
    vi.stubGlobal('Highlight', class {});
    const container = { current: document.createElement('div') };
    const view = renderHook(({ shown }) => useAttentionHighlights(container, shown, [], {}), {
      initialProps: { shown: undefined as AttentionAvailable | undefined },
    });
    expect(highlightRules()).toHaveLength(0);

    view.rerender({ shown: data });
    const second = renderHook(() => useAttentionHighlights(container, data, [], {}));
    expect(highlightRules()).toHaveLength(1);
    expect(highlightRules()[0]?.textContent).toContain('::highlight(clio-attn-level-9)');
    expect(highlightRules()[0]?.textContent).not.toContain('clio-attn-level-0');
    // Tool calls have their own ramp; every painted level is underlined in its hue.
    expect(highlightRules()[0]?.textContent).toContain(
      '::highlight(clio-attn-tool-level-9) { background-color: color-mix(in oklch, var(--attention-heat-tool) 90%',
    );
    expect(highlightRules()[0]?.textContent).toContain(
      '::highlight(clio-attn-level-1) { background-color: color-mix(in oklch, var(--attention-heat-text) 22%, transparent); text-decoration: underline;',
    );

    second.unmount();
    expect(highlightRules()).toHaveLength(1);
    view.rerender({ shown: undefined });
    expect(highlightRules()).toHaveLength(0);
  });
});
