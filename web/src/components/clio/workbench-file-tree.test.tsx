import type { WorkspaceFileEntry } from '@clio/core/v3';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkbenchFileTree } from './workbench-file-tree';
import { buildFileTree } from './workbench-file-tree-model';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const file = (path: string): WorkspaceFileEntry => ({ path, type: 'file', internal: false });

it('sorts folders first, opens a folder on demand and selects a file', () => {
  const onSelect = vi.fn();
  render(
    <WorkbenchFileTree
      changedPaths={new Set(['src/b.ts'])}
      nodes={buildFileTree([file('README.md'), file('src/b.ts'), file('src/a.ts')])}
      onSelect={onSelect}
    />,
  );
  expect(screen.getAllByRole('treeitem').map((row) => row.textContent)).toEqual([
    'src',
    'README.md',
  ]);
  fireEvent.click(screen.getByRole('button', { name: 'Expand folder src' }));
  expect(screen.getAllByRole('treeitem').map((row) => row.textContent)).toEqual([
    'src',
    'a.ts',
    'b.ts',
    'README.md',
  ]);
  const changed = screen.getByRole('treeitem', { name: 'b.ts, changed in this conversation' });
  expect(changed).toHaveAttribute('aria-level', '2');
  fireEvent.click(changed);
  expect(onSelect).toHaveBeenCalledWith('src/b.ts');
  fireEvent.click(screen.getByRole('button', { name: 'Collapse folder src' }));
  expect(screen.getAllByRole('treeitem')).toHaveLength(2);
});

it('mounts only the rows in view when a folder holds thousands of files', () => {
  const entries = Array.from({ length: 5000 }, (_, index) =>
    file(`perf/sample-${String(index).padStart(5, '0')}.csv`),
  );
  // jsdom has no layout: give the scroll viewport a 600 px window.
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.dataset.slot === 'scroll-area-viewport' ? 600 : 0;
  });
  render(
    <div data-slot="scroll-area-viewport">
      <WorkbenchFileTree nodes={buildFileTree(entries)} onSelect={() => {}} />
    </div>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Expand folder perf' }));
  const rows = screen.getAllByRole('treeitem');
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.length).toBeLessThan(100);
  expect(screen.getByRole('tree').style.height).toBe(`${5001 * 28}px`);
});
