/**
 * 1.0 item 6 — large-transcript virtual windowing.
 *
 * jsdom does no layout, so these tests exercise the estimate-based
 * windowing math (the measurement pass is a refinement that only runs in
 * real browsers — covered by the live 1000-message Playwright test).
 */
import { render, screen, cleanup } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { Transcript } from '../../src/components/Transcript.js';
import type { Message } from '@clio/core';

afterEach(cleanup);

function makeMessages(n: number): Message[] {
  return Array.from(
    { length: n },
    (_, i) =>
      ({
        id: `m${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        parts: [{ type: 'text', text: `Message number ${i}` }],
      }) as Message,
  );
}

/** A fake scroll container — jsdom can't lay out, so clientHeight is stubbed. */
function makeScrollEl(height = 800): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientHeight', {
    value: height,
    configurable: true,
  });
  el.scrollTo = ((opts: ScrollToOptions | number) => {
    el.scrollTop =
      typeof opts === 'object' ? (opts.top ?? 0) : (opts as number);
    el.dispatchEvent(new Event('scroll'));
  }) as typeof el.scrollTo;
  document.body.appendChild(el);
  return el;
}

describe('Transcript virtual windowing (1.0 item 6)', () => {
  it('renders every message below the threshold (no spacers)', () => {
    const msgs = makeMessages(50);
    render(() => (
      <Transcript messages={msgs} density="normal" scrollEl={makeScrollEl()} />
    ));
    expect(document.querySelectorAll('.trx-msg').length).toBe(50);
    expect(screen.queryByTestId('trx-spacer-top')).toBeNull();
    expect(screen.queryByTestId('trx-spacer-bottom')).toBeNull();
  });

  it('renders a bounded window (not all 500) above the threshold', () => {
    const msgs = makeMessages(500);
    render(() => (
      <Transcript messages={msgs} density="normal" scrollEl={makeScrollEl()} />
    ));
    const rendered = document.querySelectorAll('.trx-msg').length;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(60);
    // Spacers preserve the scroll geometry of the ~490 hidden messages.
    expect(screen.getByTestId('trx-spacer-top')).toBeTruthy();
    const bottom = screen.getByTestId('trx-spacer-bottom') as HTMLElement;
    expect(parseInt(bottom.style.height, 10)).toBeGreaterThan(10_000);
  });

  it('slides the window as the container scrolls', () => {
    const msgs = makeMessages(500);
    const scrollEl = makeScrollEl();
    render(() => (
      <Transcript messages={msgs} density="normal" scrollEl={scrollEl} />
    ));
    // At the top: the first message is mounted, the last is not.
    expect(document.getElementById('msg-m0')).toBeTruthy();
    expect(document.getElementById('msg-m499')).toBeNull();
    // Scroll to the (estimated) bottom → the window covers the end.
    scrollEl.scrollTop = 500 * 132;
    scrollEl.dispatchEvent(new Event('scroll'));
    expect(document.getElementById('msg-m499')).toBeTruthy();
    expect(document.getElementById('msg-m0')).toBeNull();
  });

  it('renders everything when no scroll container is provided (fallback)', () => {
    const msgs = makeMessages(200);
    render(() => <Transcript messages={msgs} density="normal" />);
    expect(document.querySelectorAll('.trx-msg').length).toBe(200);
    expect(screen.queryByTestId('trx-spacer-top')).toBeNull();
  });

  it('suppresses the entrance animation in virtual mode', () => {
    const msgs = makeMessages(500);
    render(() => (
      <Transcript messages={msgs} density="normal" scrollEl={makeScrollEl()} />
    ));
    expect(screen.getByTestId('transcript').classList.contains('trx--virtual')).toBe(
      true,
    );
  });
});
