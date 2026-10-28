import { scienceLogSchema, type ScienceStudy } from '@clio/core/v3';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudyViews } from './study-views';

vi.mock('@/lib/a2ui/processor-store', () => ({ useA2uiSessionRegistry: vi.fn() }));
vi.mock('./a2ui-surface', () => ({
  ClioA2UISurface: ({ surface, readOnly }: { surface: { id: string }; readOnly?: boolean }) => (
    <p data-read-only={String(Boolean(readOnly))}>surface {surface.id}</p>
  ),
}));

afterEach(cleanup);

const surface = (id: string, sessionId: string) => ({
  id,
  session_id: sessionId,
  catalog_id: 'https://iowarp.ai/a2ui/catalogs/clio-workspace/v1',
  protocol_version: '0.9.1',
  revision: 3,
  state: 'ready',
  messages: [],
});

function study(views: unknown[]): ScienceStudy {
  return scienceLogSchema.parse({
    session_id: 'sess_root',
    in_study: true,
    study: 'e_1',
    root_session_id: 'sess_root',
    branches: [
      { session_id: 'sess_root', title: 'Solver study', relation: 'root' },
      { session_id: 'sess_b', title: 'Entropy branch', relation: 'step' },
    ],
    entries: [],
    views,
  }) as ScienceStudy;
}

const view = (entry: string, sessionId: string, extra: Record<string, unknown> = {}) => ({
  entry,
  session_id: sessionId,
  surface_id: `surface_${entry}`,
  title: `Title ${entry}`,
  purpose: `Purpose ${entry}`,
  serves: ['e_1'],
  created_at: '2026-10-27T10:00:00Z',
  surface: surface(`surface_${entry}`, sessionId),
  ...extra,
});

describe('Study views', () => {
  it("shows one view at a time, as its owner's surface, and switches by title", async () => {
    render(<StudyViews study={study([view('e_v1', 'sess_root'), view('e_v2', 'sess_b')])} />);
    const shown = screen.getByRole('region');
    expect(within(shown).getByRole('heading', { name: 'Title e_v1' })).toBeVisible();
    expect(within(shown).getByText('Purpose e_v1')).toBeVisible();
    expect(within(shown).getByText('Attached by the study')).toBeVisible();
    expect(within(shown).getByText('surface surface_e_v1')).toBeVisible();
    expect(screen.queryByText('surface surface_e_v2')).toBeNull();
    const switcher = screen.getByRole('radiogroup', { name: 'Study views' });
    await userEvent.click(within(switcher).getByRole('radio', { name: 'Title e_v2' }));
    const drill = screen.getByRole('region');
    expect(within(drill).getByText('Attached by Entropy branch')).toBeVisible();
    expect(within(drill).getByText('surface surface_e_v2')).toHaveAttribute(
      'data-read-only',
      'false',
    );
    expect(screen.queryByText('surface surface_e_v1')).toBeNull();
  });

  it('has no switcher for a single view', () => {
    render(<StudyViews study={study([view('e_v1', 'sess_root')])} />);
    expect(screen.queryByRole('radiogroup', { name: 'Study views' })).toBeNull();
  });

  it('says in words when the owner deleted the surface, or it cannot be read', async () => {
    render(
      <StudyViews
        readOnly
        study={study([
          view('e_v1', 'sess_root', { surface: null, reason: 'view_surface_deleted' }),
          view('e_v2', 'sess_b', { surface: { id: 'broken' } }),
        ])}
      />,
    );
    expect(screen.getByText(/has since deleted its dashboard/u)).toBeVisible();
    await userEvent.click(screen.getByRole('radio', { name: 'Title e_v2' }));
    expect(screen.getByRole('alert')).toHaveTextContent("This view's dashboard could not be read.");
  });
});

describe('Study tree view links', () => {
  it("open Views on the view the link names, not the switcher's first", async () => {
    const { ScienceLogView } = await import('./science-log-tab');
    const user = userEvent.setup();
    const viewed = study([view('e_v1', 'sess_root'), view('e_v2', 'sess_b')]);
    render(
      <ScienceLogView sessionId="sess_root" study={viewed} views={<StudyViews study={viewed} />} />,
    );
    await user.click(screen.getByRole('button', { name: 'Title e_v2' }));
    const switcher = screen.getByRole('radiogroup', { name: 'Study views' });
    expect(within(switcher).getByRole('radio', { name: 'Title e_v2' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByText('surface surface_e_v2')).toBeVisible();
  });
});
