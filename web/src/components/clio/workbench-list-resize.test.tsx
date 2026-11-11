import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkbenchListSection } from './workbench-list-column';
import { WORKBENCH_LIST_SHARE_KEY } from './workbench-list-width';

const PANEL = 1000;

function renderList({ overlay = false } = {}) {
  const view = render(
    <div data-testid="panel">
      <WorkbenchListSection overlay={overlay} title="Artifacts">
        <p>3D printer · Live telemetry dashboard</p>
      </WorkbenchListSection>
    </div>,
  );
  const panel = screen.getByTestId('panel');
  Object.defineProperty(panel, 'clientWidth', { configurable: true, value: PANEL });
  const list = screen.getByRole('region', { name: 'Artifacts list' });
  // jsdom has no layout: the list measures what its share of the panel would be.
  list.getBoundingClientRect = () =>
    ({ width: (parseFloat(list.style.width) / 100) * PANEL }) as DOMRect;
  return { ...view, list };
}

const stored = () => window.localStorage.getItem(WORKBENCH_LIST_SHARE_KEY);

describe('workbench list resize', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('opens at the spec share and stores nothing until the user resizes', () => {
    const { list } = renderList();
    expect(list.style.width).toBe('36%');
    expect(stored()).toBeNull();
  });

  it('resizes with the arrow keys on the focused handle and stores on release', () => {
    const { list } = renderList();
    const handle = screen.getByRole('separator', { name: 'Resize Artifacts list' });
    expect(handle).toHaveAttribute('aria-orientation', 'vertical');
    expect(handle).toHaveAttribute('aria-valuenow', '36');
    expect(handle).toHaveAttribute('tabindex', '0');

    // The handle is on the list's left edge: left widens it.
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(list.style.width).toBe('37.6%');
    expect(stored()).toBeNull();
    fireEvent.keyUp(handle, { key: 'ArrowLeft' });
    expect(JSON.parse(stored()!)).toEqual({ list: 0.376 });

    fireEvent.keyDown(handle, { key: 'ArrowRight', shiftKey: true });
    expect(list.style.width).toBe('31.2%');
    expect(handle).toHaveAttribute('aria-valuenow', '31');
  });

  it('keeps the list between its minimum and room for the tabs', () => {
    const { list } = renderList();
    const handle = screen.getByRole('separator', { name: 'Resize Artifacts list' });
    fireEvent.keyDown(handle, { key: 'Home' });
    expect(list.style.width).toBe('18%');
    // 1000 px panel: the 44 px strip and 280 px of tabs stay.
    fireEvent.keyDown(handle, { key: 'End' });
    expect(list.style.width).toBe('67.6%');
    fireEvent.keyUp(handle, { key: 'End' });
    expect(JSON.parse(stored()!)).toEqual({ list: 0.676 });
  });

  it('restores the stored width and resets on double-click', () => {
    window.localStorage.setItem(WORKBENCH_LIST_SHARE_KEY, JSON.stringify({ list: 0.5 }));
    const { list, unmount } = renderList();
    expect(list.style.width).toBe('50%');
    unmount();

    const again = renderList();
    fireEvent.doubleClick(screen.getByRole('separator', { name: 'Resize Artifacts list' }));
    expect(again.list.style.width).toBe('36%');
    expect(JSON.parse(stored()!)).toEqual({});
  });

  it('ignores a stored width outside the allowed range', () => {
    window.localStorage.setItem(WORKBENCH_LIST_SHARE_KEY, JSON.stringify({ list: 3 }));
    expect(renderList().list.style.width).toBe('36%');
  });

  it('has no handle while the list lies over a narrow panel', () => {
    const { list } = renderList({ overlay: true });
    expect(list.style.width).toBe('');
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });
});
