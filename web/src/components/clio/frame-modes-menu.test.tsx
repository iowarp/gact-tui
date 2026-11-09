import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CodeIcon, EyeIcon } from 'lucide-react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tabs } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DocumentViewControls } from './document-view-controls';
import { FileModeControls } from './file-mode-controls';
import { FrameTalkTake } from './file-viewer-take';
import { FrameBar } from './primitives/frame-bar';

const MODES = [
  { value: 'render', label: 'Render', icon: EyeIcon },
  { value: 'source', label: 'Source', icon: CodeIcon },
];

function Frame({
  onChange,
  document = false,
  onAdd,
}: {
  onChange: (value: string) => void;
  document?: boolean;
  onAdd?: () => void;
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
        actions={
          <FrameTalkTake
            addToMessage={onAdd ? { onSelect: onAdd } : undefined}
            menu={<span>Properties</span>}
          />
        }
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

  it('labels Add to message in … with @, its letter in the bar, and runs it on @', async () => {
    const restore = narrowFrameBars();
    // The app's CSS for the fold flag; jsdom has no Tailwind.
    const style = document.createElement('style');
    style.textContent =
      '[data-fold-talk] .group-data-\\[fold-talk\\]\\/frame\\:hidden { display: none }';
    document.head.append(style);
    try {
      const onAdd = vi.fn();
      render(
        <TooltipProvider>
          <Frame onChange={() => {}} onAdd={onAdd} />
        </TooltipProvider>,
      );
      await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
      const add = screen.getByRole('menuitem', { name: /Add to message/ });
      expect(add.textContent).toContain('@');
      expect(add.textContent).not.toMatch(/Ctrl|⌘/u);
      await userEvent.keyboard('@');
      expect(onAdd).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('menu')).toBeNull();
    } finally {
      style.remove();
      restore();
    }
  });
});
