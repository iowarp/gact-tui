import { describe, expect, it } from 'vitest';

import { latexProblems } from './latex-model';
import type { LatexReport } from '@clio/core/v3';

const report = (diagnostics: unknown[]) =>
  ({ build: { diagnostics, counts: {} } }) as unknown as LatexReport;

describe('latexProblems', () => {
  it('drops a trailing line from the message, since the row shows the line on its own', () => {
    const [problem] = latexProblems(
      report([{ kind: 'overfull_box', message: 'Overfull hbox, line 48', line: 48 }]),
    );
    expect(problem.title).toBe('Overfull hbox');
    expect(problem.line).toBe(48);
  });

  it('keeps a line that is not the problem line, or a message without a line', () => {
    const problems = latexProblems(
      report([
        { kind: 'overfull_box', message: 'Overfull hbox, line 12', line: 48 },
        { kind: 'undefined_citation', message: 'Citation smap008 undefined', line: 0 },
      ]),
    );
    expect(problems.map((problem) => problem.title)).toEqual([
      'Overfull hbox, line 12',
      'Citation smap008 undefined',
    ]);
  });

  it('only warns about an undefined citation or reference, since the PDF still builds', () => {
    const problems = latexProblems(
      report([
        { kind: 'undefined_citation', message: 'Citation smap008 undefined', line: 34 },
        { kind: 'undefined_reference', message: 'Reference fig:a undefined', line: 12 },
        { kind: 'missing_file', message: 'figs/a.png not found', line: 0 },
      ]),
    );
    expect(problems.map((problem) => problem.severity)).toEqual(['warning', 'warning', 'error']);
  });
});
