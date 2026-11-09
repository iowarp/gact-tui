import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LatexSourcePane } from './latex-source-pane';

vi.mock('./comments/comment-session', () => ({ useCommentSession: () => undefined }));

afterEach(cleanup);

const texts = {
  'main.tex': '\\documentclass{article}\n\\begin{document}\n\\maketitle\n\\end{document}',
  'sections/eval.tex': `\\section{Evaluation}\n${'A very long line of measured results. '.repeat(20)}`,
};

function pane(file: string, activeLine?: number) {
  return (
    <LatexSourcePane
      activeLine={activeLine}
      diagnostics={[]}
      file={file}
      onLine={() => undefined}
      texts={texts}
    />
  );
}

describe('LatexSourcePane', () => {
  it('keeps each line number in view when a long line scrolls the source sideways', () => {
    render(pane('sections/eval.tex'));
    const number = screen.getByText('2', { selector: 'span' });
    const gutter = number.parentElement!;
    expect(gutter.className).toContain('sticky');
    expect(gutter.className).toContain('left-0');
    expect(gutter.getAttribute('data-comment-skip')).toBe('');
  });

  it('shows a line from its start when the PDF opens it', () => {
    const { rerender } = render(pane('sections/eval.tex'));
    const scroller = screen.getByRole('region', { name: 'Source of sections/eval.tex' });
    scroller.scrollLeft = 640;
    expect(scroller.scrollLeft).toBe(640);
    rerender(pane('main.tex', 3));
    expect(screen.getByRole('region', { name: 'Source of main.tex' }).scrollLeft).toBe(0);
  });
});
