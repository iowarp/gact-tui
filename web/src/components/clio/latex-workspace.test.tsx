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
        kind: 'undefined_reference',
        message: 'Reference nowhere is undefined.',
        file: 'sections/eval.tex',
        line: 2,
        page: 1,
        detail: 'nowhere',
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
    counts: { undefined_reference: 1, font_warning: 1 },
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
    'sections/eval.tex': '\\section{Scaling}\\label{sec:scaling}\nSee~\\ref{nowhere}.\nDone.',
  },
  page_sizes: [
    [612, 792],
    [612, 792],
  ],
};

afterEach(() => {
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

describe('LaTeX workspace', () => {
  it('says how the build went in words, not colour alone, and lists every problem', async () => {
    renderPaper();
    const summary = await screen.findByRole('button', {
      name: /2 pages, 1 problem, 1 warning/u,
    });
    fireEvent.click(summary);
    const problems = await screen.findByRole('list', { name: 'Build problems' });
    expect(within(problems).getByText('Undefined reference')).toBeTruthy();
    expect(within(problems).getByText(/sections\/eval\.tex:2/u)).toBeTruthy();
    expect(within(problems).getByText('Font shape substituted')).toBeTruthy();
  });

  it('opens the entry, marks a problem on its line, and moves to the file a problem is in', async () => {
    renderPaper();
    const source = await screen.findAllByRole('region', { name: 'Source of main.tex' });
    expect(source[0]?.textContent).toContain('\\input{sections/eval}');
    fireEvent.click(await screen.findByRole('button', { name: /2 pages/u }));
    fireEvent.click(
      within(await screen.findByRole('list', { name: 'Build problems' })).getByText(
        'Undefined reference',
      ),
    );
    const eval_ = await screen.findAllByRole('region', { name: 'Source of sections/eval.tex' });
    const flagged = eval_[0]!.querySelector('[data-line="2"] [role="img"]');
    expect(flagged?.getAttribute('aria-label')).toBe(
      'Undefined reference: Reference nowhere is undefined.',
    );
    expect(eval_[0]!.querySelector('[data-line="2"]')?.className).toContain('bg-primary/10');
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
    const outline = (await screen.findAllByRole('navigation', { name: 'Paper outline' }))[0]!;
    fireEvent.click(within(outline).getByRole('button', { name: /Scaling/u }));
    await waitFor(() =>
      expect(viewer.props.highlight).toEqual({ page: 1, rect: [0.1, 0.1, 0.5, 0.2] }),
    );
    expect(
      (await screen.findAllByRole('region', { name: 'Source of sections/eval.tex' })).length,
    ).toBeGreaterThan(0);
  });

  it('says when the build made no PDF, and keeps the problems', async () => {
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
    expect(
      (await screen.findAllByText('No PDF: the build stopped before making one')).length,
    ).toBeGreaterThan(0);
    expect(await screen.findByRole('button', { name: /No PDF, 1 problem/u })).toBeTruthy();
  });
});
