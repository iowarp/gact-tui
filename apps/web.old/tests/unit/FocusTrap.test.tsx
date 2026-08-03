/**
 * W3 Tier-1 a11y — modal focus traps.
 *
 * Tab / Shift+Tab must wrap inside an open modal (never escape into the
 * page behind it), and releasing the trap must restore focus to the
 * element that was focused before the modal opened.
 */
import { render, screen, cleanup, fireEvent } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { Show, createSignal } from 'solid-js';
import { trapFocus } from '../../src/focus-trap.js';
import { SlashPalette, DEFAULT_COMMANDS } from '../../src/components/SlashPalette.js';

afterEach(cleanup);

describe('trapFocus', () => {
  function buildDom() {
    document.body.innerHTML = `
      <button id="opener">open</button>
      <div id="modal">
        <button id="first">first</button>
        <input id="middle" />
        <button id="last">last</button>
      </div>
    `;
    return {
      opener: document.getElementById('opener') as HTMLButtonElement,
      modal: document.getElementById('modal') as HTMLDivElement,
      first: document.getElementById('first') as HTMLButtonElement,
      last: document.getElementById('last') as HTMLButtonElement,
    };
  }

  it('focuses the first focusable element on engage', () => {
    const { opener, modal, first } = buildDom();
    opener.focus();
    const release = trapFocus(modal);
    expect(document.activeElement).toBe(first);
    release();
  });

  it('wraps Tab from the last element back to the first', () => {
    const { modal, first, last } = buildDom();
    const release = trapFocus(modal);
    last.focus();
    fireEvent.keyDown(modal, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    release();
  });

  it('wraps Shift+Tab from the first element to the last', () => {
    const { modal, first, last } = buildDom();
    const release = trapFocus(modal);
    first.focus();
    fireEvent.keyDown(modal, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    release();
  });

  it('restores focus to the opener on release', () => {
    const { opener, modal } = buildDom();
    opener.focus();
    const release = trapFocus(modal);
    expect(document.activeElement).not.toBe(opener);
    release();
    expect(document.activeElement).toBe(opener);
  });
});

describe('trapFocusRef on a real modal (SlashPalette)', () => {
  it('keeps focus inside the palette while open', async () => {
    const [open, setOpen] = createSignal(true);
    render(() => (
      <Show when={open()}>
        <SlashPalette
          open={open()}
          query=""
          commands={DEFAULT_COMMANDS}
          onQueryChange={() => undefined}
          onPick={() => undefined}
          onClose={() => setOpen(false)}
        />
      </Show>
    ));
    // The trap engages on a microtask — flush it.
    await Promise.resolve();
    const palette = screen.getByTestId('slash-palette');
    expect(palette.getAttribute('aria-modal')).toBe('true');
    // Focus must be inside the dialog after it opens.
    expect(palette.contains(document.activeElement)).toBe(true);
  });
});
