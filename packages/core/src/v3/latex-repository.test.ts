import { describe, expect, it } from 'vitest';
import { ClioRepository } from './repository.js';
import type { ClioTransport, StreamScope, TransportFrame, TransportRequest } from './transport.js';

class RecordingTransport implements ClioTransport {
  public readonly requests: TransportRequest<unknown>[] = [];

  public constructor(private readonly responses: unknown[]) {}

  public request<T>(request: TransportRequest<T>): Promise<T> {
    this.requests.push(request as TransportRequest<unknown>);
    return Promise.resolve(request.decode(this.responses.shift()));
  }

  public async *stream(
    _scope: StreamScope,
    _cursor?: string,
    _signal?: AbortSignal,
  ): AsyncIterable<TransportFrame> {
    return;
  }
}

const report = {
  entry: 'paper/main.tex',
  folder: 'paper',
  build: {
    status: 'failed',
    entry: 'paper/main.tex',
    source_artifact_id: 'art/src',
    pdf: { artifact_id: 'art_pdf', name: 'main.tex.v1.pdf', path: '/ws/paper/main.pdf' },
    page_count: 2,
    diagnostics: [
      {
        kind: 'undefined_reference',
        message: 'Reference nowhere is undefined.',
        file: 'main.tex',
        line: 3,
        page: 1,
        detail: 'nowhere',
      },
      { kind: 'font_warning', message: 'Font shape substituted' },
    ],
    counts: { undefined_reference: 1, font_warning: 1 },
    read: ['main.tex'],
    network: 'bundle_hosts',
    error: '1 problem(s) make this build fail',
  },
  outline: {
    nodes: [
      {
        kind: 'section',
        file: 'sections/eval.tex',
        start_line: 1,
        end_line: 9,
        title: 'Scaling',
        level: 2,
        labels: ['sec:scaling'],
        places: [{ page: 1, rect: [72, 90, 400, 300] }],
        children: [{ kind: 'figure', file: 'sections/eval.tex', start_line: 4, end_line: 7 }],
      },
    ],
    counts: { section: 1, figure: 1 },
    unresolved_citations: [],
    synctex: true,
  },
  files: ['main.tex', 'sections/eval.tex'],
  texts: { 'main.tex': '\\documentclass{article}' },
  page_sizes: [
    [612, 792],
    [612, 792],
  ],
};

describe('LaTeX repository', () => {
  it('reads the paper report with its outline, sources and page sizes', async () => {
    const transport = new RecordingTransport([report]);
    const repository = new ClioRepository(transport);
    const result = await repository.latexReport('art/src', 'sess 1');
    expect(transport.requests[0]).toMatchObject({
      method: 'GET',
      path: '/v1/artifacts/art%2Fsrc/latex?session_id=sess%201',
    });
    expect(result.build.diagnostics[1]).toEqual({
      kind: 'font_warning',
      message: 'Font shape substituted',
      file: '',
      line: 0,
      page: 0,
      detail: '',
    });
    expect(result.outline?.nodes[0]?.children?.[0]?.kind).toBe('figure');
    expect(result.page_sizes[1]).toEqual([612, 792]);
  });

  it('locates a PDF point or a source line', async () => {
    const transport = new RecordingTransport([
      {
        status: 'complete',
        direction: 'pdf_to_source',
        page: 1,
        file: 'main.tex',
        line: 3,
        node: '',
      },
      {
        status: 'complete',
        direction: 'source_to_pdf',
        file: 'main.tex',
        line: 3,
        places: [{ page: 1, rect: [1, 2, 3, 4] }],
      },
    ]);
    const repository = new ClioRepository(transport);
    const forward = await repository.latexLocate('art', 's', { page: 1, x: 100.5, y: 200 });
    expect(transport.requests[0]?.path).toBe(
      '/v1/artifacts/art/latex/locate?session_id=s&page=1&x=100.5&y=200',
    );
    expect(forward.line).toBe(3);
    const back = await repository.latexLocate('art', 's', { file: 'sections/eval.tex', line: 9 });
    expect(transport.requests[1]?.path).toBe(
      '/v1/artifacts/art/latex/locate?session_id=s&file=sections%2Feval.tex&line=9',
    );
    expect(back.places[0]?.page).toBe(1);
  });
});
