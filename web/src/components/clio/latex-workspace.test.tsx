import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LatexReport } from '@clio/core/v3';
import { LatexWorkspace } from './latex-workspace';

const repository = vi.hoisted(() => ({
  latexReport: vi.fn(),
  latexLocate: vi.fn(),
  documentContent: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
}));
const viewer = vi.hoisted(() => ({
  props: {} as {
    highlight?: { page: number; rect: number[] };
    onPagePoint?: (page: number, x: number, y: number) => void;
  },
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
const layout = vi.hoisted(() => ({ wide: true }));
vi.mock('@/hooks/use-container-query', () => ({ useContainerQuery: () => layout.wide }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
vi.mock('./pdf-preview', () => ({
  ClioPdfPreview: (props: typeof viewer.props & { name: string }) => {
    viewer.props = props;
    return (
      <div data-slot="pdf" data-highlight={JSON.stringify(props.highlight ?? null)}>
        PDF {props.name}
      </div>
    );
  },
}));

const report: LatexReport = {
  entry: 'paper/main.tex',
  folder: 'paper',
  build: {
    status: 'failed',
    entry: 'paper/main.tex',
    source_artifact_id: 'art_src',
    pdf: { artifact_id: 'art_pdf', name: 'main.tex.v1.pdf', path: '/ws/paper/main.pdf' },
    page_count: 2,
    diagnostics: [
      {
        kind: 'error',
        message: 'Undefined control sequence.',
        file: 'sections/eval.tex',
        line: 2,
        page: 1,
        detail: '\\nowhere',
      },
      {
        kind: 'font_warning',
        message: 'Font shape substituted',
        file: '',
        line: 0,
        page: 0,
        detail: '',
      },
    ],
    counts: { error: 1, font_warning: 1 },
    read: ['main.tex', 'sections/eval.tex'],
    network: 'bundle_hosts',
    error: '1 problem(s) make this build fail',
  },
  outline: {
    nodes: [
      {
        kind: 'section',
        file: 'sections/eval.tex',
        start_line: 1,
        end_line: 3,
        title: 'Scaling',
        labels: ['sec:scaling'],
        places: [{ page: 2, rect: [61.2, 79.2, 306, 158.4] }],
      },
    ],
    counts: { section: 1 },
    unresolved_citations: [],
    synctex: true,
  },
  files: ['main.tex', 'sections/eval.tex', 'figs/a.png'],
  texts: {
    'main.tex':
      '\\documentclass{article}\n\\begin{document}\n\\input{sections/eval}\n\\end{document}',
    'sections/eval.tex': '\\section{Scaling}\\label{sec:scaling}\nSee~\\nowhere.\nDone.',
  },
  page_sizes: [
    [612, 792],
    [612, 792],
  ],
};

afterEach(() => {
  layout.wide = true;
  cleanup();
  vi.clearAllMocks();
});

function renderPaper() {
  repository.latexReport.mockResolvedValue(report);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <div style={{ width: 1200 }}>
        <LatexWorkspace artifactId="art_src" sessionId="sess_1" />
      </div>
    </QueryClientProvider>,
  );
}

/** Picks a mode in the frame bar's segment, once the paper has been built. */
async function pickView(name: string) {
  await screen.findByRole('button', { name: /^\d+ problems/u });
  const modes = await screen.findByRole('tablist', { name: 'Paper views' });
  const tab = within(modes).getByRole('tab', { name });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
}

describe('LaTeX workspace', () => {
  it('counts the problems in the frame bar, in words too, and lists every problem', async () => {
    renderPaper();
    const frame = await screen.findByRole('toolbar', { name: 'Paper' });
    expect(await within(frame).findByText('failed just now')).toBeTruthy();
    expect(within(frame).getByRole('button', { name: 'Rebuild' })).toBeTruthy();
    fireEvent.click(within(frame).getByRole('button', { name: '2 problems, 1 error' }));
    const problems = await screen.findByRole('list', { name: 'Build problems' });
    expect(within(problems).getByText('Undefined control sequence.')).toBeTruthy();
    const places = [...problems.querySelectorAll('[data-slot="latex-problem-place"]')];
    expect(places.map((place) => place.textContent?.replace(/\s+/gu, ' '))).toEqual([
      'sections/eval.tex, line 2',
    ]);
    // The place shares the message's one-line box, so it drops whole before the message cuts.
    const message = within(problems).getByText('Undefined control sequence.');
    expect(message.parentElement?.contains(places[0] ?? null)).toBe(true);
    expect(within(problems).getByText('Font shape substituted')).toBeTruthy();
  });

  it('counts the problems in words', async () => {
    renderPaper();
    const button = await screen.findByRole('button', { name: '2 problems, 1 error' });
    expect(button.textContent).toBe('2 problems');
  });

  it('opens the entry, marks a problem on its line, and moves to the file a problem is in', async () => {
    renderPaper();
    await pickView('Source');
    const source = await screen.findAllByRole('region', { name: 'Source of main.tex' });
    expect(source[0]?.textContent).toContain('\\input{sections/eval}');
    fireEvent.click(await screen.findByRole('button', { name: /^2 problems/u }));
    fireEvent.click(
      within(await screen.findByRole('list', { name: 'Build problems' })).getByRole('button', {
        name: 'Error: Undefined control sequence., sections/eval.tex, line 2',
      }),
    );
    const eval_ = await screen.findAllByRole('region', { name: 'Source of sections/eval.tex' });
    const flagged = eval_[0]!.querySelector('[data-line="2"] [role="img"]');
    expect(flagged?.getAttribute('aria-label')).toBe('Error: Undefined control sequence.');
    expect(eval_[0]!.querySelector('[data-line="2"]')?.className).toContain('bg-primary/10');
  });

  it('lists the venue checks and opens the place a failed one names', async () => {
    // Scenario L2: the double-blind check names the section where an author's name appears.
    repository.latexReport.mockResolvedValue({
      ...report,
      build: {
        ...report.build,
        venue: {
          venue: 'acm-sigconf',
          status: 'failed',
          checks: [
            {
              rule: 'Page limit',
              status: 'passed',
              message: '2 pages; the limit is 12.',
              file: '',
              line: 0,
            },
            {
              rule: 'Double-blind: author names',
              status: 'failed',
              message: "The author name 'Grace Hopper' appears outside the title block.",
              file: 'sections/eval.tex',
              line: 3,
            },
          ],
        },
      },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <LatexWorkspace artifactId="art_src" sessionId="sess_1" />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: '3 problems, 2 errors' }));
    const problems = await screen.findByRole('list', { name: 'Build problems' });
    expect(within(problems).queryByText('Page limit')).toBeNull();
    expect(
      problems.querySelector(
        '[aria-label^="Error: Double-blind"] [data-slot="latex-problem-place"]',
      )?.textContent,
    ).toMatch(/^sections\/eval\.tex,\sline 3$/u);
    fireEvent.click(within(problems).getByText('Double-blind: author names'));
    const eval_ = await screen.findAllByRole('region', { name: 'Source of sections/eval.tex' });
    expect(eval_[0]!.querySelector('[data-line="3"]')?.className).toContain('bg-primary/10');
  });

  it('clicks a source line through to its box on the PDF, and a PDF point back to its line', async () => {
    repository.latexLocate.mockImplementation(async (_id: string, _session: string, at: object) =>
      'file' in at
        ? {
            status: 'complete',
            direction: 'source_to_pdf',
            file: 'main.tex',
            line: 3,
            node: '',
            places: [{ page: 1, rect: [61.2, 158.4, 306, 39.6] }],
          }
        : {
            status: 'complete',
            direction: 'pdf_to_source',
            file: 'sections/eval.tex',
            line: 2,
            node: '',
            places: [],
          },
    );
    renderPaper();
    await pickView('Side by side');
    const source = (await screen.findAllByRole('region', { name: 'Source of main.tex' }))[0]!;
    fireEvent.click(source.querySelector('[data-line="3"]')!);
    await waitFor(() =>
      expect(repository.latexLocate).toHaveBeenCalledWith('art_src', 'sess_1', {
        file: 'main.tex',
        line: 3,
      }),
    );
    await waitFor(() =>
      expect(viewer.props.highlight).toEqual({ page: 0, rect: [0.1, 0.2, 0.5, 0.05] }),
    );
    viewer.props.onPagePoint?.(1, 0.5, 0.25);
    await waitFor(() =>
      expect(repository.latexLocate).toHaveBeenLastCalledWith('art_src', 'sess_1', {
        page: 2,
        x: 306,
        y: 198,
      }),
    );
    const eval_ = await screen.findAllByRole('region', { name: 'Source of sections/eval.tex' });
    expect(eval_[0]!.querySelector('[data-line="2"]')?.className).toContain('bg-primary/10');
  });

  it('goes from an outline entry to its source and its place in the PDF', async () => {
    renderPaper();
    await pickView('Side by side');
    fireEvent.click(await screen.findByRole('button', { name: 'Outline' }));
    const outline = await screen.findByRole('navigation', { name: 'Paper outline' });
    fireEvent.click(within(outline).getByRole('button', { name: '1 Scaling' }));
    await waitFor(() =>
      expect(viewer.props.highlight).toEqual({ page: 1, rect: [0.1, 0.1, 0.5, 0.2] }),
    );
    expect(
      (await screen.findAllByRole('region', { name: 'Source of sections/eval.tex' })).length,
    ).toBeGreaterThan(0);
  });

  it('opens on the PDF, shows the source or both side by side, and a PDF point brings the source back', async () => {
    renderPaper();
    const view = () => document.querySelector('[data-view]')!.getAttribute('data-view');
    await waitFor(() => expect(document.querySelectorAll('[data-slot="pdf"]')).toHaveLength(1));
    expect(view()).toBe('pdf');
    expect(screen.queryByRole('region', { name: /^Source of/u })).toBeNull();
    await pickView('Source');
    expect(view()).toBe('source');
    // Each pane is named for its own mode, not the frame's Preview.
    expect(screen.getByRole('tabpanel', { name: 'Source' })).toBeTruthy();
    expect(document.querySelector('[data-slot="pdf"]')).toBeNull();
    await pickView('Side by side');
    expect(view()).toBe('both');
    expect(document.querySelectorAll('[data-slot="pdf"]')).toHaveLength(1);
    expect(screen.getAllByRole('region', { name: 'Source of main.tex' })).toHaveLength(1);
    await pickView('Render');
    expect(view()).toBe('pdf');
    expect(screen.getByRole('tabpanel', { name: 'Render' })).toBeTruthy();
    // A point on the PDF brings its source back beside it.
    repository.latexLocate.mockResolvedValue({
      status: 'complete',
      direction: 'pdf_to_source',
      file: 'sections/eval.tex',
      line: 2,
      node: '',
      places: [],
    });
    viewer.props.onPagePoint?.(0, 0.5, 0.5);
    await waitFor(() => expect(view()).toBe('both'));
  });

  it('renders one copy of each pane when narrow, so its controls appear once', async () => {
    layout.wide = false;
    renderPaper();
    await waitFor(() => expect(document.querySelectorAll('[data-slot="pdf"]')).toHaveLength(1));
    expect(screen.queryByRole('tab', { name: 'Side by side' })).toBeNull();
    await pickView('Source');
    expect(await screen.findAllByRole('region', { name: 'Source of main.tex' })).toHaveLength(1);
    expect(document.querySelectorAll('[data-slot="pdf"]')).toHaveLength(0);
  });

  it('opens on the source when the build made no PDF, and says so with a rebuild', async () => {
    repository.latexReport.mockResolvedValue({
      ...report,
      build: {
        ...report.build,
        pdf: null,
        page_count: 0,
        error: 'missing_file: figs/a.png is not in the project.',
      },
      outline: null,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <LatexWorkspace artifactId="art_src" sessionId="sess_1" />
      </QueryClientProvider>,
    );
    expect(await screen.findAllByRole('region', { name: 'Source of main.tex' })).toHaveLength(1);
    expect(document.querySelector('[data-view]')!.getAttribute('data-view')).toBe('source');
    await pickView('Render');
    expect(
      (await screen.findAllByText('No PDF: the build stopped before making one')).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '2 problems, 1 error' })).toBeTruthy();
    const calls = repository.latexReport.mock.calls.length;
    fireEvent.click(screen.getAllByRole('button', { name: 'Rebuild' }).at(-1)!);
    await waitFor(() => expect(repository.latexReport.mock.calls.length).toBe(calls + 1));
  });
});
