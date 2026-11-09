import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderedMathHeight, renderedMathWidth } from '@/lib/pending-math';
import { MarkdownText } from './markdown';

afterEach(cleanup);

describe('math while KaTeX loads', () => {
  it('reserves a faint box for each formula instead of its TeX source', async () => {
    const { container } = render(
      <MarkdownText mode="static">
        {'Then $x^2 + \\alpha$ grows.\n\n$$\n\\frac{a}{b}\n$$'}
      </MarkdownText>,
    );
    const pending = container.querySelectorAll<HTMLElement>('[data-math-pending]');
    expect([...pending].map((box) => box.dataset.mathPending)).toEqual(['inline', 'display']);
    expect(pending[0]).toHaveAttribute('aria-hidden', 'true');
    expect(container.textContent).not.toContain('x^2');
    expect(container.textContent).not.toContain('\\frac');
    expect(container.textContent).toContain('Then');

    await waitFor(() => expect(container.querySelectorAll('.katex')).toHaveLength(2));
    expect(container.querySelector('[data-math-pending]')).toBeNull();
  });

  it('sizes a box by the glyphs KaTeX draws at its 1.21 scale, not the source length', () => {
    expect(renderedMathWidth('x^2 + \\alpha')).toBe(4.8);
    expect(renderedMathWidth('\\left( a \\right)')).toBe(3.6);
    expect(renderedMathWidth('\\bar{u}')).toBe(1.2);
  });

  it('reserves display height for stacked limits, fractions and each line', () => {
    expect(renderedMathHeight('\\bar{u} = \\frac{1}{N}\\sum_{i=1}^{N} u_i')).toBe(3.8);
    expect(renderedMathHeight('\\int_0^1 f(x)\\,dx')).toBe(3);
    expect(renderedMathHeight('\\frac{a}{b}')).toBe(2.6);
    expect(renderedMathHeight('a = b \\\\ c = d')).toBe(2.9);
  });
});
