import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { useConversationPreview } from './use-conversation-preview';

const { transcript, artifacts } = vi.hoisted(() => ({ transcript: vi.fn(), artifacts: vi.fn() }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://preview.test' } }),
}));
vi.mock('./use-repository', () => ({
  useRepository: () => ({ transcript, sessionArtifacts: artifacts }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('reads only the selected session and never displays the previous selection while loading', async () => {
  transcript.mockImplementation(async (id: string) => ({ messages: [{ id }], artifacts: [] }));
  artifacts.mockResolvedValue({ artifacts: [], used: [] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result, rerender } = renderHook(({ id }) => useConversationPreview(id), {
    initialProps: { id: 'fork' },
    wrapper,
  });
  await waitFor(() => expect(result.current.messages[0]?.id).toBe('fork'));
  transcript.mockImplementation(() => new Promise(() => {}));
  rerender({ id: 'child' });
  expect(result.current.messages).toEqual([]);
  expect(result.current.pending).toBe(true);
  expect(transcript.mock.calls.map((call) => call[0])).toEqual(['fork', 'child']);
  expect(artifacts.mock.calls.map((call) => call[0])).toEqual(['fork', 'child']);
  // Only the newest page: a preview never reads a long conversation whole.
  expect(transcript.mock.calls[0]?.[2]).toEqual({ limit: 40 });
  client.clear();
});

it('keeps transcript and output read errors explicit', async () => {
  transcript.mockRejectedValue(new Error('History unavailable'));
  artifacts.mockRejectedValue(new Error('Outputs unavailable'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useConversationPreview('fork'), { wrapper });
  await waitFor(() => expect(result.current.error?.message).toBe('History unavailable'));
  await waitFor(() => expect(result.current.outputsError?.message).toBe('Outputs unavailable'));
  expect(result.current.outputs).toEqual([]);
  client.clear();
});

it('lists produced files for the selected conversation without promoting copied references', async () => {
  const record = (id: string, owner: string) => ({
    name: `${id}.md`,
    kind: 'other',
    workspace_id: 'workspace',
    head_artifact_id: id,
    versions: [
      { artifact_id: id, version: 1, media_type: 'text/markdown', producer: { session_id: owner } },
    ],
  });
  transcript.mockResolvedValue({
    messages: [],
    artifacts: [
      { id: 'copied', name: 'copied.md', session_id: 'fork', media_type: 'text/markdown' },
    ],
  });
  artifacts.mockResolvedValue({
    artifacts: [record('own', 'fork'), record('parent-copy', 'parent')],
    used: [record('input', 'parent')],
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useConversationPreview('fork'), { wrapper });
  await waitFor(() => expect(result.current.outputs.map((item) => item.name)).toEqual(['own.md']));
  client.clear();
});
