import { render, screen, cleanup } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { InlineMarkdown } from '../../src/components/InlineMarkdown.js';

afterEach(cleanup);

describe('InlineMarkdown', () => {
  it('renders plain text in a paragraph', () => {
    render(() => <InlineMarkdown text="Hello, world." />);
    const p = screen.getByText('Hello, world.');
    expect(p.tagName).toBe('SPAN');
    expect(p.closest('p')).toBeTruthy();
  });

  it('splits paragraphs on blank lines', () => {
    render(() => <InlineMarkdown text={'one\n\ntwo'} />);
    const ps = document.querySelectorAll('p');
    expect(ps.length).toBe(2);
  });

  it('keeps single newlines inside a paragraph as <br>', () => {
    render(() => <InlineMarkdown text={'line one\nline two'} />);
    const ps = document.querySelectorAll('p');
    expect(ps.length).toBe(1);
    expect(ps[0]!.innerHTML).toContain('<br>');
  });

  it('renders bold via **…**', () => {
    render(() => <InlineMarkdown text="this is **important**." />);
    const strong = document.querySelector('strong');
    expect(strong?.textContent).toBe('important');
  });

  it('renders italic via *…*', () => {
    render(() => <InlineMarkdown text="this is *subtle*." />);
    const em = document.querySelector('em');
    expect(em?.textContent).toBe('subtle');
  });

  it('renders inline code via backticks', () => {
    render(() => <InlineMarkdown text="run `pnpm install` first." />);
    const code = document.querySelector('code.im__inline-code');
    expect(code?.textContent).toBe('pnpm install');
  });

  it('renders fenced code blocks', () => {
    render(() => <InlineMarkdown text={'prefix\n```python\nprint(\'hi\')\n```\nsuffix'} />);
    const pre = document.querySelector('pre.im__code');
    expect(pre).toBeTruthy();
    expect(pre?.textContent).toBe("print('hi')");
    expect(pre?.className).toContain('im__code--python');
  });

  it('does not interpret HTML tags from the input', () => {
    render(() => <InlineMarkdown text="<script>alert(1)</script>" />);
    // SolidJS escapes by default; the <script> appears as literal text.
    expect(document.querySelector('script')).toBeNull();
    expect(document.body.innerHTML).toContain('&lt;script&gt;');
  });
});
