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

  // --- #222: inline-code across streaming chunk boundaries ---
  // The transcript streams cumulative text. A backtick code span (e.g. a Windows
  // path with backslashes) can arrive split ACROSS chunks — the opening backtick in
  // one delta, the closing backtick in a later one. The renderer must not drop the
  // span's content nor the spaces around it, streaming or settled.
  const BS = String.fromCharCode(92); // a single backslash
  const path = `C:${BS}Users${BS}alice${BS}notes.txt`;

  it('#222 whole: renders a backtick path span with backslashes intact (settled)', () => {
    const { container } = render(() => <Markdown text={`Open \`${path}\` please`} />);
    expect(container.querySelector('.im code')?.textContent).toBe(path);
    // Surrounding words + their spaces survive.
    expect(container.textContent).toBe(`Open ${path} please`);
  });

  it('#222 chunked: a code span split mid-span across streaming chunks, then settled', () => {
    const [get, setText] = createAppendable('Open `C:');
    const [streaming, setStreaming] = createAppendable(true as boolean);
    const { container } = render(() => <Markdown text={get()} streaming={streaming()} />);
    // Cumulative deltas whose boundaries fall INSIDE the still-open code span.
    setText(`Open \`C:${BS}Us`);
    setText(`Open \`C:${BS}Users${BS}alice`);
    setText(`Open \`C:${BS}Users${BS}alice${BS}notes.txt`);
    setText(`Open \`C:${BS}Users${BS}alice${BS}notes.txt\``);
    setText(`Open \`C:${BS}Users${BS}alice${BS}notes.txt\` please`);
    // Settle (stream ends).
    setStreaming(false);
    expect(container.querySelector('.im code')?.textContent).toBe(path);
    expect(container.textContent).toBe(`Open ${path} please`);
  });

  it('#222 mid-stream: an open (unterminated) code span shows its chars, not dropped', () => {
    const [get, setText] = createAppendable('open `C:');
    const { container } = render(() => <Markdown text={get()} streaming />);
    // Grow the span while it is still OPEN (no closing backtick yet). The live tail
    // must surface the code characters so far — they must not vanish waiting for the
    // close.
    setText(`open \`C:${BS}Users${BS}alice`);
    expect(container.textContent).toContain(`C:${BS}Users${BS}alice`);
  });

  it('#222 chunked: an inline code span with an underscore survives split streaming', () => {
    const [get, setText] = createAppendable('run `shell');
    const [streaming, setStreaming] = createAppendable(true as boolean);
    const { container } = render(() => <Markdown text={get()} streaming={streaming()} />);
    setText('run `shell_ba');
    setText('run `shell_bash');
    setText('run `shell_bash`');
    setText('run `shell_bash` now');
    setStreaming(false);
    // The code content is exactly the identifier — no spurious backslash leaked in
    // from the emphasis sanitizer treating the still-open span as prose.
    expect(container.querySelector('.im code')?.textContent).toBe('shell_bash');
    expect(container.textContent).toBe('run shell_bash now');
    expect(container.textContent).not.toContain(BS);
  });

  // The issue's exact reported shapes. Broken render "ate" the surrounding spaces —
  // "I will callpandas_profile_csvwith this exact path" — and dropped everything up to
  // the last backtick. These feed the span split mid-token, then settle.
  it('#222 exact shape: tool-name span keeps its surrounding spaces (issue DoD)', () => {
    const [get, setText] = createAppendable('I will call `pandas');
    const [streaming, setStreaming] = createAppendable(true as boolean);
    const { container } = render(() => <Markdown text={get()} streaming={streaming()} />);
    setText('I will call `pandas_profile');
    setText('I will call `pandas_profile_csv`');
    setText('I will call `pandas_profile_csv` with this exact path');
    setStreaming(false);
    expect(container.querySelector('.im code')?.textContent).toBe('pandas_profile_csv');
    // The spaces on BOTH sides of the span survive (the reported bug ate them).
    expect(container.textContent).toBe('I will call pandas_profile_csv with this exact path');
  });

  it('#222 exact shape: two path spans with backslashes + underscore survive chunked', () => {
    const csvPath = `D:${BS}Libraries${BS}Documents${BS}projects${BS}ndp-demo-workspace${BS}MTA1.CI.LY_.30.csv`;
    const full = `authorizes this file at \`acquisition.local_path\` = \`${csvPath}\`, confirming`;
    const [get, setText] = createAppendable('authorizes this file at `acq');
    const [streaming, setStreaming] = createAppendable(true as boolean);
    const { container } = render(() => <Markdown text={get()} streaming={streaming()} />);
    // Chunk boundaries fall inside both code spans.
    setText('authorizes this file at `acquisition.local_path` = `D:' + BS + 'Lib');
    setText(`authorizes this file at \`acquisition.local_path\` = \`${csvPath.slice(0, -8)}`);
    setText(`authorizes this file at \`acquisition.local_path\` = \`${csvPath}\`, conf`);
    setText(full);
    setStreaming(false);
    const codes = container.querySelectorAll('.im code');
    expect(Array.from(codes).map((c) => c.textContent)).toEqual(['acquisition.local_path', csvPath]);
    // Whole rendered line matches the backend text, spans + surrounding spaces intact.
    expect(container.textContent).toBe(
      `authorizes this file at acquisition.local_path = ${csvPath}, confirming`,
    );
  });
});

import { createSignal } from 'solid-js';
function createAppendable<T>(initial: T): [() => T, (v: T) => void] {
  const [v, set] = createSignal(initial);
  return [v as () => T, set as (v: T) => void];
}
