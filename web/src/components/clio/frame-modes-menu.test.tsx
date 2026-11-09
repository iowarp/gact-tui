import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CodeIcon, EyeIcon, GitBranchIcon } from 'lucide-react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tabs } from '@/components/ui/tabs';
import { DocumentViewControls } from './document-view-controls';
import { FileModeControls } from './file-mode-controls';
import { FrameTalkTake } from './file-viewer-take';
import { FrameBar } from './primitives/frame-bar';

const MODES = [
  { value: 'render', label: 'Render', icon: EyeIcon },
  { value: 'source', label: 'Source', icon: CodeIcon, shortcut: 'render-source' },
  { value: 'lineage', label: 'Lineage', icon: GitBranchIcon, shortcut: 'lineage' },
];

function Frame({
  onChange,
  document = false,
}: {
  onChange: (value: string) => void;
  document?: boolean;
}) {
  const [mode, setMode] = useState('render');
  const [view, setView] = useState('preview');
  const select = (value: string) => {
    setMode(value);
    onChange(value);
  };
  return (
    <Tabs value={mode} onValueChange={select}>
      <FrameBar
        label="File actions"
        where={<span>notes.md</span>}
        format={
          <>
            <FileModeControls label="View" modes={MODES} value={mode} onChange={select} />
            {document ? (
              <Tabs value={view} onValueChange={setView}>
                <DocumentViewControls markdown value={view} onChange={setView} />
              </Tabs>
            ) : null}
          </>
        }
        actions={<FrameTalkTake menu={<span>Properties</span>} />}
      />
    </Tabs>
  );
}

/** jsdom has no layout: make every frame bar report it is cut off so it folds all the way. */
function narrowFrameBars() {
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

afterEach(cleanup);

describe('frame bar modes at the narrowest fold', () => {
  it('keeps the modes out of the … menu while the bar is wide', async () => {
    render(<Frame onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Render' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.queryByRole('menuitemradio', { name: 'Render' })).toBeNull();
  });

  it('lists the modes in the … menu as a checked list and switches from there', async () => {
    const restore = narrowFrameBars();
    try {
      const onChange = vi.fn();
      render(<Frame onChange={onChange} />);
      expect(
        screen.getByRole('toolbar', { name: 'File actions' }).hasAttribute('data-fold-modes-menu'),
      ).toBe(true);
      await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
      const group = screen.getByRole('group', { name: 'View' });
      expect(group).toBeTruthy();
      expect(
        screen.getByRole('menuitemradio', { name: 'Render' }).getAttribute('aria-checked'),
      ).toBe('true');
      expect(
        screen.getByRole('menuitemradio', { name: 'Source' }).getAttribute('aria-checked'),
      ).toBe('false');
      expect(screen.getByText('Properties')).toBeTruthy();
      await userEvent.click(screen.getByRole('menuitemradio', { name: 'Source' }));
      expect(onChange).toHaveBeenCalledWith('source');
      await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
      expect(
        screen.getByRole('menuitemradio', { name: 'Source' }).getAttribute('aria-checked'),
      ).toBe('true');
    } finally {
      restore();
    }
  });

  it('lists every mode group in the bar, a document’s own modes included', async () => {
    const restore = narrowFrameBars();
    try {
      render(<Frame onChange={() => {}} document />);
      await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
      const groups = screen.getAllByRole('group').map((group) => group.getAttribute('aria-label'));
      expect(groups).toEqual(['View', 'File representations']);
      const inGroup = (name: string) => within(screen.getByRole('group', { name }));
      await userEvent.click(
        inGroup('File representations').getByRole('menuitemradio', { name: 'Source' }),
      );
      await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
      expect(
        inGroup('File representations')
          .getByRole('menuitemradio', { name: 'Source' })
          .getAttribute('aria-checked'),
      ).toBe('true');
      expect(
        inGroup('View').getByRole('menuitemradio', { name: 'Render' }).getAttribute('aria-checked'),
      ).toBe('true');
    } finally {
      restore();
    }
  });

  it('shows each mode\u2019s key in the \u2026 menu without adding it to the name', async () => {
    const restore = narrowFrameBars();
    try {
      render(<Frame onChange={() => {}} />);
      await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
      const source = screen.getByRole('menuitemradio', { name: 'Source' });
      expect(source.getAttribute('aria-keyshortcuts')).toBe('Control+Shift+V');
      expect(source.querySelector('[data-slot="shortcut-keys"]')?.textContent).toBe('Ctrl Shift V');
      const lineage = screen.getByRole('menuitemradio', { name: 'Lineage' });
      expect(lineage.querySelector('[data-slot="shortcut-keys"]')?.textContent).toBe(
        'Ctrl Shift L',
      );
      const plain = screen.getByRole('menuitemradio', { name: 'Render' });
      expect(plain.hasAttribute('aria-keyshortcuts')).toBe(false);
      expect(plain.querySelector('[data-slot="shortcut-keys"]')).toBeNull();
    } finally {
      restore();
    }
  });

  it('switches with the mode keys from inside the frame and back again', async () => {
    const onChange = vi.fn();
    render(
      <>
        <button type="button">Elsewhere</button>
        <Frame onChange={onChange} />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Elsewhere' }));
    await userEvent.keyboard('{Control>}{Shift>}L{/Shift}{/Control}');
    expect(onChange).not.toHaveBeenCalled();
    act(() => screen.getByRole('tab', { name: 'Render' }).focus());
    await userEvent.keyboard('{Control>}{Shift>}L{/Shift}{/Control}');
    expect(onChange).toHaveBeenLastCalledWith('lineage');
    await userEvent.keyboard('{Control>}{Shift>}V{/Shift}{/Control}');
    expect(onChange).toHaveBeenLastCalledWith('source');
    await userEvent.keyboard('{Control>}{Shift>}V{/Shift}{/Control}');
    expect(onChange).toHaveBeenLastCalledWith('lineage');
  });
});
