import { render, cleanup } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { Markdown } from '../../src/components/Markdown.js';

afterEach(cleanup);

/**
 * The single incremental markdown renderer (streaming-markdown / smd). We don't
 * re-test the library's full grammar — just the app-level guarantees the prior
 * InlineMarkdown cluster owned: it renders into a `.im` wrapper, formats basic
 * markdown, and never injects raw HTML (XSS-safe via text nodes). Plus the reason
 * it exists: appended text does not re-create earlier DOM (no plain->format flip).
 */
describe('Markdown (smd incremental renderer)', () => {
  it('wraps output in .im and formats bold + inline code', () => {
    const { container } = render(() => <Markdown text={'run `x` and **go**'} />);
    const im = container.querySelector('.im');
    expect(im).toBeTruthy();
    expect(im!.querySelector('code')?.textContent).toBe('x');
    expect(im!.querySelector('strong')?.textContent).toBe('go');
  });

  it('renders a fenced code block as <pre><code> (no raw html)', () => {
    const { container } = render(() => <Markdown text={'```js\nconst a = 1;\n```'} />);
    expect(container.querySelector('.im pre code')).toBeTruthy();
  });

  it('escapes HTML — never creates a live <script> element', () => {
    const { container } = render(() => <Markdown text={'<script>alert(1)</script>'} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('alert(1)');
  });

  it('does NOT italicize intraword underscores (shell_bash, time_s) — no cascade', () => {
    const { container } = render(() => (
      <Markdown text={'The shell_bash tool ran; columns time_s and temperature_c are intact.'} />
    ));
    // No emphasis spans at all — the underscores are literal, not italic.
    expect(container.querySelector('.im em, .im i')).toBeNull();
    expect(container.textContent).toContain('shell_bash');
    expect(container.textContent).toContain('time_s');
    expect(container.textContent).toContain('temperature_c');
  });

  it('leaves underscores inside inline code untouched (no leaked backslash)', () => {
    const { container } = render(() => <Markdown text={'run `geo_geocode` now'} />);
    expect(container.querySelector('.im code')?.textContent).toBe('geo_geocode');
    expect(container.textContent).not.toContain('\\');
  });

  it('still italicizes real emphasis (*word* and **bold**)', () => {
    const { container } = render(() => <Markdown text={'a *word* and **bold** here'} />);
    expect(container.querySelector('.im em')?.textContent).toBe('word');
    expect(container.querySelector('.im strong')?.textContent).toBe('bold');
  });

  it('keeps prior DOM when text is only appended (incremental, no full reparse)', () => {
    let text = '# Heading\n\nfirst paragraph';
    const [get, setText] = createAppendable(text);
    const { container } = render(() => <Markdown text={get()} streaming />);
    const headingBefore = container.querySelector('h1');
    expect(headingBefore?.textContent).toBe('Heading');
    setText(text + ' and more');
    // The same <h1> node is still present (not torn down + rebuilt).
    expect(container.querySelector('h1')).toBe(headingBefore);
  });
});

import { createSignal } from 'solid-js';
function createAppendable(initial: string): [() => string, (v: string) => void] {
  const [v, set] = createSignal(initial);
  return [v, set];
}
