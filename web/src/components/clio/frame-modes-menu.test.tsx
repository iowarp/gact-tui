import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CodeIcon, EyeIcon, ZoomInIcon, ZoomOutIcon } from 'lucide-react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tabs } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DocumentViewControls } from './document-view-controls';
import { FileModeControls } from './file-mode-controls';
import { FrameTalkTake } from './file-viewer-take';
import { FrameBar } from './primitives/frame-bar';
import { ToolbarAction } from './viewer-toolbar';

const MODES = [
  { value: 'render', label: 'Render', icon: EyeIcon },
  { value: 'source', label: 'Source', icon: CodeIcon },
];

function Frame({
  onChange,
  document = false,
  tools,
}: {
  onChange: (value: string) => void;
  document?: boolean;
  tools?: React.ReactNode;
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
            {tools}
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
});

describe('the renderer’s Format icons at the narrowest fold', () => {
  function Zoom({ onIn, outReason }: { onIn: () => void; outReason?: string }) {
    return (
      <div role="group" aria-label="Diagram zoom">
        <ToolbarAction label="Zoom out" disabledReason={outReason} onClick={() => {}}>
          <ZoomOutIcon aria-hidden="true" />
        </ToolbarAction>
        <ToolbarAction label="Zoom in" onClick={onIn}>
          <ZoomInIcon aria-hidden="true" />
        </ToolbarAction>
      </div>
    );
  }

  it('keeps them in the bar, not the … menu, while the bar is wide', async () => {
    render(<Frame onChange={() => {}} tools={<Zoom onIn={() => {}} />} />);
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.queryByRole('menuitem', { name: /Zoom in/ })).toBeNull();
  });

  it('lists them in the … menu after the modes and runs them from there', async () => {
    const restore = narrowFrameBars();
    try {
      const onIn = vi.fn();
      render(<Frame onChange={() => {}} tools={<Zoom onIn={onIn} outReason="Already fitted" />} />);
      await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
      const rows = screen.getAllByRole('menuitem').map((row) => row.textContent);
      expect(rows.slice(0, 2)).toEqual(['Zoom outAlready fitted', 'Zoom in']);
      expect(screen.getByRole('menuitem', { name: /Zoom out/ }).getAttribute('aria-disabled')).toBe(
        'true',
      );
      await userEvent.click(screen.getByRole('menuitem', { name: 'Zoom in' }));
      expect(onIn).toHaveBeenCalledTimes(1);
    } finally {
      restore();
    }
  });

  it('leaves the … trigger itself in the bar', () => {
    const restore = narrowFrameBars();
    try {
      render(<Frame onChange={() => {}} tools={<Zoom onIn={() => {}} />} />);
      const more = screen.getByRole('button', { name: 'More actions' });
      expect(more.closest('[data-slot="frame-format"]')).toBeNull();
    } finally {
      restore();
    }
  });

  it('keeps a menu or popover trigger in the bar, out of the … menu', async () => {
    const restore = narrowFrameBars();
    try {
      render(
        <Frame
          onChange={() => {}}
          tools={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <ToolbarAction label="Source file: main.tex">
                  <CodeIcon aria-hidden="true" />
                </ToolbarAction>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>main.tex</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />,
      );
      const trigger = screen.getByRole('button', { name: 'Source file: main.tex' });
      expect(trigger.hasAttribute('data-frame-tool')).toBe(false);
      await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
      expect(screen.queryByRole('menuitem', { name: /Source file/ })).toBeNull();
    } finally {
      restore();
    }
  });
});
