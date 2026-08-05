/**
 * Markdown-lite contract (W1, NDP showcase): agent prose renders its
 * structure — never literal `##` / `**asterisks**` (ported render contract,
 * web.old RENDERING_SPEC:338). One mono font; weight+color differentiation.
 */
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
});
