import { scienceLogSchema, type ScienceStudy } from '@clio/core/v3';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { useStudyViewFocus } from '@/lib/a2ui/open-view';
import { ScienceLogView } from './science-log-tab';

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => ({}) }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
vi.mock('@/providers/appearance-provider', () => ({
  useAppearancePreferences: () => ({ hideDotFiles: false }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const view = (entry: string, sessionId: string, title: string) => ({
  entry,
  session_id: sessionId,
  surface_id: `surface_${entry}`,
  title,
  purpose: 'Watch it',
  serves: ['e_000000000001'],
  created_at: '2026-10-27T10:00:00Z',
  surface: null,
});

const study = scienceLogSchema.parse({
  session_id: 'sess_root',
  in_study: true,
  study: 'e_000000000001',
  root_session_id: 'sess_root',
  branches: [
    { session_id: 'sess_root', title: 'Mesh study', relation: 'root' },
    {
      session_id: 'sess_b',
      title: 'Coarse meshes',
      relation: 'step',
      parent_session_id: 'sess_root',
    },
  ],
  entries: [
    {
      id: 'e_000000000001',
      study: 'e_000000000001',
      branch: 'sess_root',
      session: 'sess_root',
      type: 'question',
      fields: { statement: 'Which mesh converges?' },
      links: [],
      status: 'open',
      created_at: '2026-10-27T10:00:00Z',
      invocation: 'call_1',
    },
  ],
  views: [
    view('e_00000000000a', 'sess_root', 'Overview'),
    view('e_00000000000b', 'sess_b', 'Coarse cases'),
  ],
}) as ScienceStudy;

function draw() {
  const scrolled: string[] = [];
  vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(function (
    this: HTMLElement,
  ) {
    scrolled.push(this.id);
  });
  render(<ScienceLogView sessionId="sess_root" study={study} views={<StudyPanels />} />);
  return scrolled;
}

function StudyPanels() {
  return (
    <>
      {study.views.map((row) => (
        <section aria-label={row.title} id={`study-view-${row.entry}`} key={row.entry} />
      ))}
    </>
  );
}

it("lists each branch's views in the tree and opens one in Views", async () => {
  const scrolled = draw();
  expect(screen.getByRole('button', { name: 'Overview' })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Coarse cases' }));
  expect(screen.getByRole('radio', { name: 'Views' })).toHaveAttribute('aria-checked', 'true');
  await vi.waitFor(() => expect(scrolled).toContain('study-view-e_00000000000b'));
});

it('opens the view openView asked for', async () => {
  const scrolled = draw();
  act(() => useStudyViewFocus.getState().focus('e_00000000000a'));
  expect(screen.getByRole('radio', { name: 'Views' })).toHaveAttribute('aria-checked', 'true');
  await vi.waitFor(() => expect(scrolled).toContain('study-view-e_00000000000a'));
  expect(useStudyViewFocus.getState().entry).toBeUndefined();
});
