import type { A2UISurface, PendingInteraction } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { vi } from 'vitest';
import { ClioPendingInteractions } from './pending-interactions';

type PendingInteractionsProps = ComponentProps<typeof ClioPendingInteractions>;

export function pending(
  kind: PendingInteraction['kind'],
  overrides: Partial<PendingInteraction> = {},
): PendingInteraction {
  return {
    id: `${kind}:interaction_1`,
    kind,
    owner_session_id: 'sess_child',
    attended_session_id: 'sess_root',
    status: 'pending',
    title: 'Response requested',
    source: { protocol: kind === 'mcp_task_input' ? 'mcp' : 'native' },
    created_at: '2026-09-02T00:00:00Z',
    ...overrides,
  };
}

export function renderPending(
  interactions: PendingInteraction[],
  options: {
    disabled?: boolean;
    error?: Error;
    onRefetchSurfaces?: ReturnType<
      typeof vi.fn<NonNullable<PendingInteractionsProps['onRefetchSurfaces']>>
    >;
    onResponse?: ReturnType<typeof vi.fn<PendingInteractionsProps['onResponse']>>;
    ownerLabels?: Record<string, string>;
    surfaces?: Record<string, A2UISurface>;
    viewedSessionId?: string;
  } = {},
) {
  const onResponse = options.onResponse ?? vi.fn(async () => undefined);
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ClioPendingInteractions
        disabled={options.disabled}
        error={options.error}
        interactions={interactions}
        onRefetchSurfaces={options.onRefetchSurfaces}
        onResponse={onResponse}
        ownerLabels={options.ownerLabels ?? { sess_child: 'Evidence specialist' }}
        surfaces={options.surfaces}
        viewedSessionId={options.viewedSessionId ?? 'sess_root'}
      />
    </QueryClientProvider>,
  );
  return onResponse;
}
