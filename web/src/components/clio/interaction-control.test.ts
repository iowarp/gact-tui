import { describe, expect, it } from 'vitest';
import { focusFirstFocusable } from './interaction-control';

describe('focusFirstFocusable', () => {
  it('focuses the first control inside the a2ui response viewport, not an earlier header control', () => {
    document.body.innerHTML = `
      <div tabindex="-1">
        <button>Resize interactive surface</button>
        <div data-slot="a2ui-response-viewport">
          <button id="submit">Submit selection</button>
        </div>
      </div>
    `;
    const container = document.body.firstElementChild as HTMLElement;

    focusFirstFocusable(container);

    expect(document.activeElement).toBe(document.getElementById('submit'));
  });

  it('falls back to the whole card search when there is no a2ui response viewport', () => {
    document.body.innerHTML = `
      <div tabindex="-1">
        <button id="send">Send response</button>
      </div>
    `;
    const container = document.body.firstElementChild as HTMLElement;

    focusFirstFocusable(container);

    expect(document.activeElement).toBe(document.getElementById('send'));
  });
});
