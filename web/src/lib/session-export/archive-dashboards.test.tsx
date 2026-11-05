import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ArchiveDashboard } from './archive-dashboards';
import { useArchiveDashboards } from './archive-dashboards-query';

const repository = vi.hoisted(() => ({ dashboards: vi.fn(), dashboard: vi.fn() }));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/components/clio/dashboard-view', () => ({
  DashboardView: ({ report, offline }: { report: { title: string }; offline?: boolean }) => (
    <p>{`${report.title} (${offline ? 'offline' : 'live'})`}</p>
  ),
}));

afterEach(cleanup);

function Results({ ids }: { ids: string[] }) {
  const dashboards = useArchiveDashboards(ids);
  return (
    <>
      {dashboards.map(({ sessionId, dashboard }) => (
        <ArchiveDashboard
          key={dashboard.artifact_id}
          sessionId={sessionId}
          artifactId={dashboard.artifact_id}
          title={dashboard.title}
        />
      ))}
      <p>{`${dashboards.length} dashboards`}</p>
    </>
  );
}

it("shows each session's captured dashboards offline; an uncaptured one says so", async () => {
  repository.dashboards.mockImplementation(async (sessionId: string) => {
    if (sessionId === 'old') throw new Error('not captured'); // an archive from before
    return sessionId === 'root'
      ? [{ id: 'a', title: 'Printer', artifact_id: 'artifact_a', created_at: 't' }]
      : [{ id: 'b', title: 'Lost', artifact_id: 'artifact_b', created_at: 't' }];
  });
  repository.dashboard.mockImplementation(async (_sessionId: string, artifactId: string) => {
    if (artifactId === 'artifact_b') throw new Error('missing');
    return { title: 'Printer status' };
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Results ids={['root', 'child', 'old']} />
    </QueryClientProvider>,
  );
  expect(await screen.findByText('Printer status (offline)')).toBeVisible();
  expect(await screen.findByText(/The dashboard Lost was not captured/u)).toBeVisible();
  expect(screen.getByText('2 dashboards')).toBeVisible();
  expect(repository.dashboard).toHaveBeenCalledWith('root', 'artifact_a');
});
