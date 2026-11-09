import { scienceLogSchema, type ScienceStudy } from '@clio/core/v3';
import {
  act,
  cleanup,
  render as renderBare,
  screen,
  within,
  type RenderOptions,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStudyViewFocus } from '@/lib/a2ui/open-view';
import { StudyViews } from './study-views';
import { TooltipProvider } from '@/components/ui/tooltip';

const render = (ui: ReactElement, options?: RenderOptions) =>
  renderBare(ui, { wrapper: TooltipProvider, ...options });

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
  it("shows one view at a time, as its owner's surface, the one asked for else the first", () => {
    const views = study([view('e_v1', 'sess_root'), view('e_v2', 'sess_b')]);
    render(<StudyViews study={views} />);
    const shown = screen.getByRole('region');
    expect(within(shown).getByRole('heading', { name: 'Title e_v1' })).toBeVisible();
    expect(within(shown).getByText('Purpose e_v1')).toBeVisible();
    expect(within(shown).getByText('Attached by the study')).toBeVisible();
    expect(within(shown).getByText('surface surface_e_v1')).toBeVisible();
    expect(screen.queryByText('surface surface_e_v2')).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    act(() => useStudyViewFocus.getState().focus('e_v2'));
    const drill = screen.getByRole('region');
    expect(within(drill).getByText('Attached by Entropy branch')).toBeVisible();
    expect(within(drill).getByText('surface surface_e_v2')).toHaveAttribute(
      'data-read-only',
      'false',
    );
    expect(screen.queryByText('surface surface_e_v1')).toBeNull();
    act(() => useStudyViewFocus.getState().clear());
  });

  it('shows a view attached as a conversation view before as it is, read-only', () => {
    render(
      <StudyViews
        study={study([view('e_v1', 'sess_root', { kind: 'surface', read_only: true })])}
      />,
    );
    expect(screen.getByText(/before study views were dashboards/u)).toBeVisible();
    expect(screen.getByText('surface surface_e_v1')).toHaveAttribute('data-read-only', 'true');
  });

  it('renders a dashboard view as interactive as its owner allows', () => {
    render(
      <StudyViews
        study={study([view('e_v1', 'sess_root', { kind: 'dashboard', dashboard_id: 'rep' })])}
      />,
    );
    expect(screen.queryByText(/before study views were dashboards/u)).toBeNull();
    expect(screen.getByText('surface surface_e_v1')).toHaveAttribute('data-read-only', 'false');
  });

  it('says in words when the owner deleted the surface, or it cannot be read', () => {
    const views = study([
      view('e_v1', 'sess_root', { surface: null, reason: 'view_surface_deleted' }),
      view('e_v2', 'sess_b', { surface: { id: 'broken' } }),
    ]);
    render(<StudyViews readOnly study={views} />);
    expect(screen.getByText(/has since deleted its dashboard/u)).toBeVisible();
    act(() => useStudyViewFocus.getState().focus('e_v2'));
    expect(screen.getByText("This view's dashboard could not be read.")).toBeVisible();
    act(() => useStudyViewFocus.getState().clear());
  });
});

describe('Study list view rows', () => {
  it('open the view the row names in place of the log', async () => {
    const { ScienceLogView } = await import('./science-log-tab');
    const user = userEvent.setup();
    const viewed = study([view('e_v1', 'sess_root'), view('e_v2', 'sess_b')]);
    render(
      <ScienceLogView sessionId="sess_root" study={viewed} views={<StudyViews study={viewed} />} />,
    );
    expect(screen.queryByText('surface surface_e_v2')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'View: Title e_v2' }));
    expect(screen.getByText('surface surface_e_v2')).toBeVisible();
    expect(screen.queryByText('surface surface_e_v1')).toBeNull();
    expect(screen.getByRole('button', { name: 'View: Title e_v2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
