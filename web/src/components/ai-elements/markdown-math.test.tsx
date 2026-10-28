import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { normalizeMathMarkdown, parseMathMarkdownBlocks } from '@/lib/remark-standard-math';
import { MarkdownText } from './markdown';

afterEach(cleanup);

describe('real Markdown math renderer', () => {
  it.each([
    'Cost: $20 and $30. Then $x_1 < x_2$.',
    'Budget: $20. Then $x_1 < x_2$.',
    'Range: $20–$30. Then $x_1 < x_2$.',
  ])('does not swallow a later formula after currency: %s', async (source) => {
    const { container } = render(<MarkdownText>{source}</MarkdownText>);
    await waitFor(() => expect(container.querySelectorAll('.katex')).toHaveLength(1));
    expect(container.querySelector('annotation')?.textContent).toBe('x_1 < x_2');
  });

  it('retains unfinished single-dollar math until the closing delimiter arrives', async () => {
    const { container, rerender } = render(
      <MarkdownText isAnimating>{String.raw`Stopping time $\sigma_{\infty}(n)`}</MarkdownText>,
    );
    expect(container.querySelector('.katex')).toBeNull();
    rerender(<MarkdownText>{String.raw`Stopping time $\sigma_{\infty}(n)$.`}</MarkdownText>);
    await waitFor(() => expect(container.querySelectorAll('.katex')).toHaveLength(1));
  });

  it('keeps currency and literal dollars while still finding later inline formulas', async () => {
    const { container } = render(
      <MarkdownText mode="static">
        {String.raw`Prices: $20 and $30. Range: $20–$30. Budget: $50.

Then $x^2$ and $\text{price}=\$5$ are formulas. Escaped \$7 and code ` +
          '`$literal$` stay literal.'}
      </MarkdownText>,
    );
    await waitFor(() => expect(container.querySelectorAll('.katex')).toHaveLength(2));
    expect(container.textContent).toContain('Prices: $20 and $30. Range: $20–$30. Budget: $50.');
    expect(container.textContent).toContain('Escaped $7');
    expect(container.querySelector('code')?.textContent).toBe('$literal$');
    expect(container.querySelector('.katex-error')).toBeNull();
  });

  for (const mode of ['static', 'streaming'] as const) {
    it(`renders single-dollar Collatz formulas in ${mode} headings and prose`, async () => {
      const { container } = render(
        <MarkdownText mode={mode}>
          {String.raw`# Collatz Total Stopping-Time Analysis ($1 \le n \le 1{,}000{,}000$)

The total stopping time $\sigma_{\infty}(n)$ reaches $1$, with $\sigma_{\infty}(1) = 0$.

The longest chain starts at $n = 837{,}799$ and requires $524$ steps.

$$
T(n)=\begin{cases}n/2 & n\equiv 0\pmod 2\\3n+1 & n\equiv 1\pmod 2\end{cases}
$$`}
        </MarkdownText>,
      );
      await waitFor(() => expect(container.querySelectorAll('.katex')).toHaveLength(7));
      expect(container.querySelector('h1 .katex')).not.toBeNull();
      expect(container.querySelectorAll('.katex-display')).toHaveLength(1);
      expect(container.querySelector('.katex-error')).toBeNull();
    });
  }

  for (const mode of ['static', 'streaming'] as const) {
    it(`renders standard delimiters and existing dollar math in ${mode} messages`, async () => {
      const { container } = render(
        <MarkdownText mode={mode}>
          {String.raw`Velocity \(\mathbf{u}\) and density \(\rho\).

\[
\rho\left(\frac{\partial \mathbf{u}}{\partial t} + (\mathbf{u}\cdot\nabla)\mathbf{u}\right) = -\nabla p + \mu\nabla^2\mathbf{u} + \mathbf{f}
\]

\[\nabla\cdot\mathbf{u}=0\]

Existing $$x^2$$.

$$
E = mc^2
$$`}
        </MarkdownText>,
      );
      await waitFor(() => expect(container.querySelectorAll('.katex')).toHaveLength(6));
      expect(container.querySelectorAll('.katex-display')).toHaveLength(3);
      expect(container.querySelector('.katex-error')).toBeNull();
      expect(container.querySelector('annotation')?.textContent).toBe(String.raw`\mathbf{u}`);
    });
  }

  it('preserves code, escaped delimiters, links and single-dollar currency', async () => {
    const { container } = render(
      <MarkdownText mode="static">
        {'Cost: $20 and $30. Literal `\\(x^2\\)`.\n' +
          String.raw`

\\(literal\\) and [reference](https://example.com/a).

~~~tex
\[x^2\]
~~~

    \(indented\)

\(a_* < b_2\)`}
      </MarkdownText>,
    );
    await waitFor(() => expect(container.querySelectorAll('.katex')).toHaveLength(1));
    expect(container.textContent).toContain('$20 and $30');
    expect(container.textContent).toContain(String.raw`\(literal\)`);
    expect(container.querySelector('a')).toHaveAttribute('href', 'https://example.com/a');
    expect(container.querySelector('annotation')?.textContent).toBe('a_* < b_2');
    expect(container.textContent).toContain(String.raw`\[x^2\]`);
    expect(container.textContent).toContain(String.raw`\(indented\)`);
  });

  it('does not invent a closing delimiter while streaming and recovers on completion', async () => {
    const { container, rerender } = render(
      <MarkdownText isAnimating>{String.raw`Before \(x^2`}</MarkdownText>,
    );
    expect(container.querySelector('.katex')).toBeNull();
    rerender(<MarkdownText>{String.raw`Before \(x^2\). After.`}</MarkdownText>);
    await waitFor(() => expect(container.querySelectorAll('.katex')).toHaveLength(1));
    expect(container.textContent).toContain('After.');
  });

  it('keeps blank lines and TeX line breaks inside one display block', async () => {
    const equation = String.raw`\[
\begin{aligned}
x &= 1 \\

y &= 2
\end{aligned}
\]`;
    const blocks = parseMathMarkdownBlocks(`Before.\n\n${equation}\n\nAfter.`);
    expect(blocks.some((block) => block.includes(equation))).toBe(true);
    const { container } = render(<MarkdownText>{`Before.\n\n${equation}\n\nAfter.`}</MarkdownText>);
    await waitFor(() => expect(container.querySelectorAll('.katex-display')).toHaveLength(1));
    expect(container.querySelector('.katex-error')).toBeNull();
    expect(container.textContent).toContain('After.');
  });

  it('keeps unmatched double-dollar guidance literal beside valid formulas', async () => {
    const source =
      'Math: inline LaTeX uses $$x^2$$ on one line; display LaTeX uses $$ on separate\n' +
      'lines. Single-dollar text stays literal. For example:\n$$\n\\bar{x}=1\n$$';
    const { container } = render(<MarkdownText mode="static">{source}</MarkdownText>);

    await waitFor(() => expect(container.querySelectorAll('.katex')).toHaveLength(2));
    expect(source).toContain('display LaTeX uses $$ on separate');
    expect(container.textContent).toContain('display LaTeX uses $$ on separate');
    expect(container.querySelectorAll('annotation')[0]?.textContent).toBe('x^2');
    expect(container.querySelectorAll('annotation')[1]?.textContent).toBe(String.raw`\bar{x}=1`);
    expect(container.querySelector('.katex-error')).toBeNull();
  });

  it('does not rewrite double-dollar literals in inline or fenced code', () => {
    const source =
      'Inline `$$literal$$` stays exact.\n\n~~~text\n$$block literal$$\n~~~\n\n' +
      '> ```text\n> $$quoted literal$$\n> ```\n\n' +
      '- Nested code:\n  ```text\n  $$nested literal$$\n  ```\n\n' +
      'Outside the list:\n\n    echo $$';
    const { container } = render(<MarkdownText mode="static">{source}</MarkdownText>);

    expect(container.querySelector('code')?.textContent).toBe('$$literal$$');
    expect(container.textContent).toContain('$$quoted literal$$');
    expect(container.textContent).toContain('$$nested literal$$');
    expect(container.textContent).toContain('echo $$');
    expect(container.querySelectorAll('pre code')).toHaveLength(4);
    expect(container.querySelector('pre code')?.textContent).toBe('$$block literal$$');
    expect(container.querySelector('.katex')).toBeNull();
  });

  it('does not escape paired double-dollar math around inline code spans', () => {
    const inlineCodeFormula = '$$\\text{`foo`}$$';
    expect(normalizeMathMarkdown(inlineCodeFormula)).toBe(inlineCodeFormula);
  });

  it('preserves display math fences nested in block quotes and lists', async () => {
    const source =
      '> Guidance: inline $$x^2$$; display uses $$ on separate lines.\n>\n> $$\n> x=1\n> $$' +
      '\n\n- $$\n  y=2\n  $$';
    const { container } = render(<MarkdownText mode="static">{source}</MarkdownText>);

    await waitFor(() => expect(container.querySelectorAll('.katex-display')).toHaveLength(2));
    expect(container.querySelectorAll('.katex')).toHaveLength(3);
  });

  it('renders math in lists, quotes, links and tables without changing their structure', async () => {
    const { container } = render(
      <MarkdownText mode="static">
        {String.raw`- Measured \(x_1\).
- Other \(x_2\).

> Compare \(y\).

[\(z\)](https://example.com/math)

| Variable | Value |
| --- | --- |
| \(q\) | 1 |`}
      </MarkdownText>,
    );
    await waitFor(() => expect(container.querySelectorAll('.katex')).toHaveLength(5));
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('blockquote .katex')).not.toBeNull();
    expect(container.querySelector('a .katex')).not.toBeNull();
    expect(container.querySelector('table .katex')).not.toBeNull();
  });

  it('keeps dollar references across lines as prose instead of breaking the parser', async () => {
    const text = 'Run the plan: $task\nReview this draft: $draft, then report.';
    const { container } = render(<MarkdownText>{text}</MarkdownText>);
    await waitFor(() => expect(container.textContent).toContain('$draft'));
    expect(container.querySelector('.katex')).toBeNull();
    expect(container.textContent).toContain('$task');
  });

  it('leaves unmatched and empty delimiters as ordinary text', () => {
    const { container } = render(
      <MarkdownText mode="static">{String.raw`\(\) \[ \] \(unfinished and \[also unfinished`}</MarkdownText>,
    );
    expect(container.querySelector('.katex')).toBeNull();
    expect(container.textContent).toContain('unfinished');
  });

  it('renders display delimiters embedded in prose and accepts trailing whitespace', async () => {
    const { container } = render(
      <MarkdownText>
        {'Before \\[x_1=2\\] after.\n\n\\[\r\nx=1\r\n\\]  \r\n\r\nLast.'}
      </MarkdownText>,
    );
    await waitFor(() => expect(container.querySelectorAll('.katex-display')).toHaveLength(2));
    expect(container.querySelector('.katex-error')).toBeNull();
    expect(container.textContent).toContain('after.');
    expect(container.textContent).toContain('Last.');
  });
});
