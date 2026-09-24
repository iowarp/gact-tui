import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const catalog = {
  data: {
    authoritative: 'live_handshake',
    providers: [
      {
        id: 'claude_code',
        models: [
          {
            model_id: 'claude-sonnet-5',
            aliases: ['sonnet'],
            reasoning: {
              supported: true,
              parameter: 'effort',
              levels: ['low', 'high'],
              default: 'low',
            },
          },
        ],
      },
    ],
  },
};

vi.mock('./use-provider-catalog', () => ({ useProviderCatalog: () => catalog }));

import { useModelReasoningLevels } from './use-model-reasoning-levels';

describe('useModelReasoningLevels', () => {
  it('finds an alias-configured model by its CLI alias, not just its catalog id', () => {
    // claude_code configures the alias "sonnet"; the catalog row is keyed by
    // the full id "claude-sonnet-5". An id-only lookup finds nothing and
    // hides the reasoning selector for every alias-configured model (#1436).
    const { result } = renderHook(() => useModelReasoningLevels('claude_code', 'sonnet'));
    expect(result.current?.levels).toEqual(['low', 'high']);
  });

  it('still matches a model configured by its real catalog id', () => {
    const { result } = renderHook(() => useModelReasoningLevels('claude_code', 'claude-sonnet-5'));
    expect(result.current?.levels).toEqual(['low', 'high']);
  });

  it('matches by the service-resolved id when the configured value is neither', () => {
    const { result } = renderHook(() =>
      useModelReasoningLevels('claude_code', 'sonnet-preview', 'claude-sonnet-5'),
    );
    expect(result.current?.levels).toEqual(['low', 'high']);
  });

  it('returns undefined for a model this provider does not report', () => {
    const { result } = renderHook(() => useModelReasoningLevels('claude_code', 'haiku'));
    expect(result.current).toBeUndefined();
  });

  it('returns undefined without a provider or model id', () => {
    const { result } = renderHook(() => useModelReasoningLevels(undefined, 'sonnet'));
    expect(result.current).toBeUndefined();
  });
});
