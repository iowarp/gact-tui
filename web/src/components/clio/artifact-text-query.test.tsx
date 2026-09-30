import { TransportError } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({ readArtifactText: vi.fn() }));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));

import { useArtifactText } from './artifact-text-query';

function wrap({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useArtifactText', () => {
  it('reads a well-formed dataUri artifact by id, with no fetch_path', async () => {
    repository.readArtifactText.mockResolvedValue('graph TD; A-->B;');
    const { result } = renderHook(() => useArtifactText('artifact://artifact_diagram01'), {
      wrapper: wrap,
    });

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.text).toBe('graph TD; A-->B;'));
    expect(repository.readArtifactText).toHaveBeenCalledWith(
      'artifact_diagram01',
      undefined,
      expect.anything(),
    );
    expect(result.current.error).toBe('');
  });

  it('states that a non-artifact dataUri is not a registered reference, without a request', () => {
    const { result } = renderHook(() => useArtifactText('https://example.test/x.mmd'), {
      wrapper: wrap,
    });
    expect(result.current.error).toContain('not a registered artifact id');
    expect(repository.readArtifactText).not.toHaveBeenCalled();
  });

  it('states a not_found refusal in words', async () => {
    repository.readArtifactText.mockRejectedValue(
      new TransportError('gone', 404, 'not_found', {}),
    );
    const { result } = renderHook(() => useArtifactText('artifact://artifact_missing01'), {
      wrapper: wrap,
    });
    await waitFor(() => expect(result.current.error).toContain('not in this workspace'));
  });
});
