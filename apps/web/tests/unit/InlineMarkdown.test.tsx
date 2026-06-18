import { render, screen, cleanup, waitFor } from '@solidjs/testing-library';
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

  it('does not treat underscores inside identifiers as emphasis', () => {
    render(() => <InlineMarkdown text="columns time_s and temperature_c remain intact." />);
    expect(document.body.textContent).toContain('time_s');
    expect(document.body.textContent).toContain('temperature_c');
    expect(document.querySelector('em')).toBeNull();
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
    // Inner <code> carries the actual code body; the surrounding <pre>
    // also wraps a language badge and a copy button. Single-line block →
    // no gutter, so textContent is exactly the source (highlight is async
    // but never changes the text content).
    const code = pre?.querySelector('code');
    expect(code?.textContent).toBe("print('hi')");
    expect(pre?.className).toContain('im__code--python');
  });

  it('highlights fenced code once hljs lazily loads', async () => {
    render(() => <InlineMarkdown text={'```js\nconst x = 1;\nreturn x;\n```'} />);
    // hljs imports asynchronously; tokens appear after it resolves.
    await waitFor(() => {
      const tokens = document.querySelectorAll('.hljs-keyword');
      expect(tokens.length).toBeGreaterThan(0);
    });
  });

  it('renders a line-number gutter for blocks with 3+ lines', async () => {
    render(() => <InlineMarkdown text={'```js\nconst a = 1;\nconst b = 2;\nconst c = 3;\n```'} />);
    // The gutter rows render immediately (plain), highlight fills in later.
    await waitFor(() => {
      const nos = document.querySelectorAll('.im__code-lineno');
      expect(nos.length).toBe(3);
    });
    const nos = document.querySelectorAll('.im__code-lineno');
    expect(nos[0]?.textContent).toBe('1');
    expect(nos[1]?.textContent).toBe('2');
    expect(nos[2]?.textContent).toBe('3');
    // The numbered <code> variant is in use.
    expect(document.querySelector('code.im__code--numbered')).toBeTruthy();
  });

  it('does NOT render a gutter for a one-line block', async () => {
    render(() => <InlineMarkdown text={'```js\nconst only = 1;\n```'} />);
    // Let any async highlight settle so we know the absence is stable.
    await waitFor(() => {
      const code = document.querySelector('pre.im__code code');
      expect(code).toBeTruthy();
    });
    expect(document.querySelectorAll('.im__code-lineno').length).toBe(0);
    expect(document.querySelector('code.im__code--numbered')).toBeNull();
  });

  it('Copy button copies the raw source without line numbers', async () => {
    let copied = '';
    const original = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (t: string) => {
          copied = t;
          return Promise.resolve();
        },
      },
    });
    try {
      const src = 'const a = 1;\nconst b = 2;\nconst c = 3;';
      render(() => <InlineMarkdown text={'```js\n' + src + '\n```'} />);
      await waitFor(() => {
        expect(document.querySelectorAll('.im__code-lineno').length).toBe(3);
      });
      const btn = document.querySelector('.im__code-copy') as HTMLButtonElement;
      expect(btn).toBeTruthy();
      btn.click();
      await waitFor(() => expect(copied).toBe(src));
      // No digits leaked from the gutter into the copied text.
      expect(copied).not.toContain('1const');
    } finally {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: original,
      });
    }
  });

  it('does not interpret HTML tags from the input', () => {
    render(() => <InlineMarkdown text="<script>alert(1)</script>" />);
    // SolidJS escapes by default; the <script> appears as literal text.
    expect(document.querySelector('script')).toBeNull();
    expect(document.body.innerHTML).toContain('&lt;script&gt;');
  });

  it('repairs compact one-line pipe tables before rendering', () => {
    render(() => (
      <InlineMarkdown
        text={
          'Ranked stations | Rank | Station | Distance km | | ---: | --- | ---: | | 1 | MTA1 | 0.37 | | 2 | PKRD | 2.37 |'
        }
      />
    ));
    const table = document.querySelector('table.im__table');
    expect(table).toBeTruthy();
    expect(table?.textContent).toContain('MTA1');
    expect(table?.querySelectorAll('tbody tr').length).toBe(2);
  });
});
