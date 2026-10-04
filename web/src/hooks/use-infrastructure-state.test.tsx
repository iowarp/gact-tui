import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { describe, expect, it } from 'vitest';
import { useInfrastructureState } from './use-infrastructure-state';

describe('infrastructure view state', () => {
  it('survives navigation and stays isolated between connected CLIOs and hosts', () => {
    const client = new QueryClient();
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const first = renderHook(() => useInfrastructureState('https://delta', 'node1:provider', ''), {
      wrapper,
    });
    act(() => first.result.current[1]('vllm'));
    first.unmount();
    const restored = renderHook(
      ({ endpoint, host }) => useInfrastructureState(endpoint, `${host}:provider`, ''),
      { wrapper, initialProps: { endpoint: 'https://delta', host: 'node1' } },
    );
    expect(restored.result.current[0]).toBe('vllm');
    restored.rerender({ endpoint: 'https://homelab', host: 'node1' });
    expect(restored.result.current[0]).toBe('');
    restored.rerender({ endpoint: 'https://delta', host: 'node2' });
    expect(restored.result.current[0]).toBe('');
    restored.rerender({ endpoint: 'https://delta', host: 'node1' });
    expect(restored.result.current[0]).toBe('vllm');
  });
});
