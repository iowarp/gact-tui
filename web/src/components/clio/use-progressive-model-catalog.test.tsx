import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClioModelOption } from '@/lib/model-options';
import type { ProviderGroup } from './model-picker-model';
import { useProgressiveModelCatalog } from './use-progressive-model-catalog';

function provider(id: string, models: number): ProviderGroup {
  const choices: ClioModelOption[] = Array.from({ length: models }, (_, index) => ({
    providerId: id,
    providerName: id,
    id: `${id}/model-${index}`,
    label: `model-${index}`,
    available: true,
  }));
  return { id, name: id, choices, availableChoices: choices, health: 'healthy' };
}

describe('useProgressiveModelCatalog', () => {
  let frames: FrameRequestCallback[] = [];
  beforeEach(() => {
    frames = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  const flushFrames = () =>
    act(() => {
      for (let i = 0; i < 20 && frames.length; i++) frames.shift()?.(performance.now());
    });

  it('does not re-render a small catalog that is ready on open', () => {
    const providers = [provider('lmstudio', 2), provider('codex', 1), provider('alcf', 3)];
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useProgressiveModelCatalog(providers, 'codex');
    });
    const first = result.current;
    expect([...first].sort()).toEqual(['alcf', 'codex', 'lmstudio']);
    const afterMount = renders;
    flushFrames();
    expect(renders).toBe(afterMount);
    expect(result.current).toBe(first);
  });
});
