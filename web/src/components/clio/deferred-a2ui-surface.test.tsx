import type { A2UISurface } from '@clio/core/v3';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DeferredA2UISurface } from './conversation-message-blocks';

vi.mock('./a2ui-surface', () => ({
  ClioA2UISurface: () => <input aria-label="Unsent response" defaultValue="" />,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const surface: A2UISurface = {
  id: 'surface_viewport',
  session_id: 'session_viewport',
  catalog_id: 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json',
  protocol_version: '0.9.1',
  revision: 1,
  state: 'ready',
  messages: [],
};

function mountSurface() {
  let top = 0;
  let notify: IntersectionObserverCallback | undefined;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    x: 0,
    y: top,
    top,
    bottom: top + 120,
    left: 0,
    right: 300,
    width: 300,
    height: 120,
    toJSON: () => ({}),
  }));
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        notify = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  const view = render(<DeferredA2UISurface surface={surface} />);
  return {
    ...view,
    moveOffscreen() {
      top = window.innerHeight + 1_000;
      act(() => {
        notify?.(
          [{ isIntersecting: false } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        );
      });
    },
  };
}

it('keeps the same focused form and its unsent input when viewport measurements change', () => {
  const { moveOffscreen } = mountSurface();
  const input = screen.getByRole('textbox', { name: 'Unsent response' });
  act(() => input.focus());
  fireEvent.input(input, { target: { value: 'Response still being written' } });
  moveOffscreen();
  expect(screen.getByRole('textbox', { name: 'Unsent response' })).toBe(input);
  expect(input).toHaveValue('Response still being written');
  expect(input).toHaveFocus();
});

it('still suspends an untouched off-screen surface and reserves its measured height', () => {
  const { container, moveOffscreen } = mountSurface();
  moveOffscreen();
  expect(screen.queryByRole('textbox', { name: 'Unsent response' })).not.toBeInTheDocument();
  expect(container.querySelector('[data-a2ui-viewport="deferred"]')).toHaveStyle({
    minHeight: '120px',
  });
});
