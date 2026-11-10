import { vi } from 'vitest';

/**
 * jsdom has no layout: make every frame bar report it is cut off so it folds
 * all the way (workbench-lineage step 6). Returns the restore function.
 */
export function narrowFrameBars() {
  const scroll = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.dataset.slot === 'frame-bar' ? 400 : 0;
  });
  const client = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.dataset.slot === 'frame-bar' ? 200 : 0;
  });
  return () => {
    scroll.mockRestore();
    client.mockRestore();
  };
}
