/**
 * Markdown-lite contract (W1, NDP showcase): agent prose renders its
 * structure — never literal `##` / `**asterisks**` (ported render contract,
 * web.old RENDERING_SPEC:338). One mono font; weight+color differentiation.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import type { Message } from '@clio/core';
import { describe, expect, it } from 'vitest';
import { Markdown } from '../../src/transcript/markdown';
import { Transcript } from '../../src/transcript/Transcript';

function msg(id: string, role: Message['role'], parts: unknown[]): Message {
  return { id, role, parts: parts as Message['parts'] };
}

describe('Markdown', () => {
  it('renders headings as headings, never literal ## runs', () => {
    const { container } = render(<Markdown text={'## Region\nLos Angeles resolved.'} />);
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('Region');
    expect(container.textContent).not.toContain('##');
  });

  it('renders bold and inline code without their markers', () => {
    const { container } = render(<Markdown text={'Station **MTA1** staged via `stage_resource`.'} />);
    expect(container.querySelector('strong')).toHaveTextContent('MTA1');
    expect(container.querySelector('code')).toHaveTextContent('stage_resource');
    expect(container.textContent).not.toContain('**');
    expect(container.textContent).not.toContain('`');
  });

  it('renders unordered lists as lists', () => {
    const { container } = render(<Markdown text={'- east\n- north\n- up'} />);
    expect(container.querySelectorAll('ul > li')).toHaveLength(3);
  });

  it('renders fenced code verbatim, protected from inline transforms', () => {
    const { container } = render(<Markdown text={'```\npair_coeff 1 1 Cu_u3.eam ** not bold **\n```'} />);
    const pre = container.querySelector('pre code');
    expect(pre).toHaveTextContent('pair_coeff 1 1 Cu_u3.eam ** not bold **');
    expect(container.querySelector('pre strong')).toBeNull();
  });

  it('renders GFM tables as tables', () => {
    const { container } = render(
      <Markdown text={'| axis | mean |\n|---|---|\n| east | -0.047 |\n| north | 0.045 |'} />,
    );
    expect(container.querySelectorAll('th')).toHaveLength(2);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('links http(s) targets only; other schemes render as code, never dead anchors', () => {
    const { container } = render(
      <Markdown text={'[docs](https://example.org/x) and [csv](artifact://ws/abc)'} />,
    );
    const anchors = container.querySelectorAll('a');
    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toHaveAttribute('href', 'https://example.org/x');
    expect(container.textContent).toContain('csv');
  });

  it('is wired into transcript text parts', () => {
    const { container } = render(
      <Transcript
        messages={[msg('m1', 'assistant', [{ type: 'text', text: '## Station selected\n**MTA1** at 0.30 km.' }])]}
      />,
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Station selected');
    expect(container.textContent).not.toContain('##');
    expect(container.textContent).not.toContain('**');
  });

  describe('gutter-dot alignment (owner, round-7: a final-answer .md-h[data-level="2"] sat visibly lower than its part row\'s ● dot)', () => {
    it('a leading heading is the FIRST block in the DOM, so its own margin-top governs the misalignment', () => {
      // jsdom does not compute real layout, so the alignment fix is proven
      // structurally: the level-2 heading really is `.md`'s first child
      // (nothing else could be soaking up the 10px .md-h margin-top before
      // it), and the source-level fix (below) zeroes exactly that margin.
      const { container } = render(<Markdown text={'## Region\nLos Angeles resolved.'} />);
      const md = container.querySelector('.md');
      expect(md?.firstElementChild).toHaveClass('md-h');
      expect(md?.firstElementChild).toHaveAttribute('data-level', '2');
    });

    it('root-causes the offset: the first block in .md loses its top margin, not a magic pixel nudge', () => {
      // The bug: `.md` is a flex column, so a flex item's own margin is
      // never collapsed away by its container the way a block-level
      // first-child's would be — `.md-h`'s `margin: 10px 0 2px` therefore
      // still pushes a LEADING heading down from the gutter dot's flush-top
      // position. The fix zeroes the TOP margin of whichever block is
      // actually first (any kind, not just headings) rather than adding a
      // fixed offset to the dot or hardcoding a `.md-h`-only special case.
      const css = readFileSync(resolve(__dirname, '../../src/transcript/markdown.css'), 'utf8');
      expect(css).toMatch(/\.md\s*>\s*\*:first-child\s*{[^}]*margin-top:\s*0/s);
      // The override must be a longhand `margin-top`, not a second
      // `margin:` shorthand that would also zero the heading's own
      // bottom/side spacing for every OTHER (non-first) heading sharing the
      // same rule via cascade ordering.
      const firstChildRule = css.match(/\.md\s*>\s*\*:first-child\s*{([^}]*)}/s)?.[1] ?? '';
      expect(firstChildRule).not.toMatch(/margin:\s/);
    });
  });
});
