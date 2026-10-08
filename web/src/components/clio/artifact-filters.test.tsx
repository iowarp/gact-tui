import type { Artifact } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArtifactFilters } from './artifact-filters';
import { ClioArtifactCard } from './artifact-card';

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => ({}) }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://localhost:8790' } }),
}));
afterEach(cleanup);

const artifacts: Artifact[] = [
  'collect_sweep.py',
  'other.py',
  'optimized.glb',
  'summary.md',
  'plot.png',
].map((name) => ({
  id: name,
  name,
  media_type: 'application/octet-stream',
  session_id: 'session',
  uri: `artifact://${name}`,
}));

function list(records: Artifact[], onOpen = vi.fn()) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <ArtifactFilters artifacts={records}>
        {(visible) =>
          visible.map((artifact) => (
            <ClioArtifactCard
              artifact={artifact}
              key={artifact.id}
              onOpen={onOpen}
              preview={false}
            />
          ))
        }
      </ArtifactFilters>
    </QueryClientProvider>
  );
}

describe('ArtifactFilters', () => {
  it('filters real cards by type and search, and opens the original artifact', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const view = render(list(artifacts, onOpen));
    await user.click(screen.getByRole('combobox', { name: 'Artifact category' }));
    await user.click(screen.getByRole('option', { name: 'Scripts (2)' }));
    expect(screen.queryByText('optimized.glb')).toBeNull();
    await user.type(screen.getByRole('searchbox', { name: 'Search artifacts' }), 'sweep');
    expect(screen.getByText('1 of 5 artifacts')).toBeVisible();
    expect(screen.queryByText('other.py')).toBeNull();
    await user.click(screen.getByText('collect_sweep.py'));
    expect(onOpen.mock.calls[0]?.[0]).toBe(artifacts[0]);
    expect(view.container.querySelector('.lucide-file-code')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('5 of 5 artifacts')).toBeVisible();
    expect(screen.getByText('optimized.glb')).toBeVisible();
    expect(view.container.querySelector('.lucide-box')).not.toBeNull();
  });

  it('shows no matches, clears filters, and reconciles arriving artifacts', async () => {
    const user = userEvent.setup();
    const view = render(list(artifacts));
    await user.type(screen.getByRole('searchbox', { name: 'Search artifacts' }), 'missing');
    expect(screen.getByText('No artifacts match these filters.')).toBeVisible();
    expect(screen.getByText('0 of 5 artifacts')).toBeVisible();
    const next = { ...artifacts[0], id: 'new', name: 'missing.py' };
    view.rerender(list([...artifacts, next]));
    expect(screen.getByText('missing.py')).toBeVisible();
    expect(screen.getByText('1 of 6 artifacts')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('6 of 6 artifacts')).toBeVisible();
  });
});
