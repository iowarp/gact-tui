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

    second.unmount();
    expect(highlightRules()).toHaveLength(1);
    view.rerender({ shown: undefined });
    expect(highlightRules()).toHaveLength(0);
  });
});
