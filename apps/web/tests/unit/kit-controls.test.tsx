/**
 * Contract for the interactive kit primitives.
 *
 * Keyboard and dismissal behaviour lives in the PRIMITIVE. Every one of these
 * would otherwise be reimplemented (and forgotten) per surface — the exact
 * failure mode the kit exists to prevent.
 */
import { createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Chip, ContextMenu, Popover, Splitter, Tabs, ToolbarButton } from '../../src/kit';

describe('Tabs', () => {
  const TABS = [
    { id: 'log', label: 'log' },
    { id: 'gantt', label: 'gantt' },
    { id: 'tools', label: 'tools' },
  ];

  function Harness({ onChange }: { onChange?: (id: string) => void }) {
    const [active, setActive] = useState('log');
    return (
      <Tabs
        label="Observability"
        tabs={TABS}
        activeId={active}
        onChange={(id) => {
          setActive(id);
          onChange?.(id);
        }}
      />
    );
  }

  it('exposes a labelled tablist with one selected tab', () => {
    render(<Harness />);
    const list = screen.getByRole('tablist', { name: 'Observability' });
    expect(within(list).getByRole('tab', { selected: true })).toHaveTextContent('log');
  });

  it('selects on click', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'gantt' }));
    expect(onChange).toHaveBeenCalledWith('gantt');
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('gantt');
  });

  it('moves selection with arrow keys and wraps', () => {
    render(<Harness />);
    const list = screen.getByRole('tablist');
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('gantt');
    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    // Wrapped past the start to the last tab.
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('tools');
  });

  it('jumps to first and last with Home and End', () => {
    render(<Harness />);
    const list = screen.getByRole('tablist');
    fireEvent.keyDown(list, { key: 'End' });
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('tools');
    fireEvent.keyDown(list, { key: 'Home' });
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('log');
  });

  it('keeps only the active tab in the tab order (roving tabindex)', () => {
    render(<Harness />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.filter((t) => t.getAttribute('tabindex') === '0')).toHaveLength(1);
  });
});

describe('Popover', () => {
  function Harness({ onClose }: { onClose?: () => void }) {
    const [open, setOpen] = useState(true);
    return (
      <Popover
        open={open}
        label="Model"
        onClose={() => {
          setOpen(false);
          onClose?.();
        }}
      >
        <button type="button">option</button>
      </Popover>
    );
  }

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Model' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on outside pointer-down but not inside', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'option' }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders above its anchor when placed up', () => {
    render(
      <Popover open label="Model" placement="up" onClose={() => {}}>
        <button type="button">option</button>
      </Popover>,
    );
    expect(screen.getByRole('dialog', { name: 'Model' })).toHaveAttribute('data-placement', 'up');
  });
});

describe('ContextMenu', () => {
  const ITEMS = [
    { id: 'rename', label: 'Rename' },
    { id: 'archive', label: 'Archive' },
    { id: 'delete', label: 'Delete', tone: 'danger' as const },
  ];

  it('is a menu of menuitems positioned at the invocation point', () => {
    render(<ContextMenu open x={120} y={64} items={ITEMS} onSelect={() => {}} onClose={() => {}} />);
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(3);
    expect(menu).toHaveStyle({ left: '120px', top: '64px' });
  });

  it('selects with Enter after arrow navigation', () => {
    const onSelect = vi.fn();
    render(
      <ContextMenu open x={0} y={0} items={ITEMS} onSelect={onSelect} onClose={() => {}} />,
    );
    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    fireEvent.keyDown(menu, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('archive');
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<ContextMenu open x={0} y={0} items={ITEMS} onSelect={() => {}} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('marks a destructive item without a bespoke class', () => {
    render(<ContextMenu open x={0} y={0} items={ITEMS} onSelect={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveAttribute('data-tone', 'danger');
  });
});

describe('Chip', () => {
  it('is static text by default, not a button', () => {
    render(<Chip>ctx 41%</Chip>);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('ctx 41%')).toBeInTheDocument();
  });

  it('becomes a real button when it acts', () => {
    const onClick = vi.fn();
    render(<Chip onClick={onClick}>async 2</Chip>);
    fireEvent.click(screen.getByRole('button', { name: 'async 2' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('ToolbarButton', () => {
  it('carries an accessible name even when it renders only an icon', () => {
    render(<ToolbarButton label="Observability" icon={<svg />} onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Observability' })).toBeInTheDocument();
  });

  it('reports pressed state for toggles', () => {
    render(<ToolbarButton label="console" pressed onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'console' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('Splitter', () => {
  it('is a keyboard-operable separator', () => {
    const onResize = vi.fn();
    render(<Splitter label="Sidebar width" value={260} min={200} max={460} onResize={onResize} />);
    const sep = screen.getByRole('separator', { name: 'Sidebar width' });
    expect(sep).toHaveAttribute('aria-valuenow', '260');
    fireEvent.keyDown(sep, { key: 'ArrowRight' });
    expect(onResize).toHaveBeenCalledWith(268);
  });

  it('clamps to its bounds', () => {
    const onResize = vi.fn();
    render(<Splitter label="Sidebar width" value={460} min={200} max={460} onResize={onResize} />);
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' });
    expect(onResize).toHaveBeenCalledWith(460);
  });

  it('inverts drag/arrow direction for a right-side pane', () => {
    // On a right pane the separator rides the pane's LEFT edge: moving the
    // pointer (or arrowing) RIGHT shrinks the pane, LEFT grows it.
    const onResize = vi.fn();
    render(<Splitter label="Detail width" value={480} min={320} max={720} invert onResize={onResize} />);
    const sep = screen.getByRole('separator', { name: 'Detail width' });
    fireEvent.keyDown(sep, { key: 'ArrowRight' });
    expect(onResize).toHaveBeenCalledWith(472);
    fireEvent.keyDown(sep, { key: 'ArrowLeft' });
    expect(onResize).toHaveBeenCalledWith(488);
  });

  it('resets through double-click when the caller provides a reset', () => {
    const onReset = vi.fn();
    render(
      <Splitter label="Detail width" value={640} min={320} max={720} invert onResize={vi.fn()} onReset={onReset} />,
    );
    fireEvent.doubleClick(screen.getByRole('separator', { name: 'Detail width' }));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it('drags through pointer moves and ends the drag on pointercancel', () => {
    // Live-observed regression: a double-click selects the word under the
    // strip, the NEXT press starts a browser text-drag, and its
    // pointercancel killed the resize one step in. The grab must (a)
    // prevent the press default so no selection/text-drag ever starts and
    // (b) treat pointercancel as end-of-drag.
    const onResize = vi.fn();
    render(<Splitter label="Detail width" value={480} min={320} max={720} invert onResize={onResize} />);
    const sep = screen.getByRole('separator', { name: 'Detail width' });
    const press = createEvent.pointerDown(sep, { clientX: 1000 });
    fireEvent(sep, press);
    expect(press.defaultPrevented).toBe(true);
    fireEvent.pointerMove(document, { clientX: 900 });
    expect(onResize).toHaveBeenLastCalledWith(580);
    fireEvent.pointerCancel(document);
    onResize.mockClear();
    fireEvent.pointerMove(document, { clientX: 700 });
    expect(onResize).not.toHaveBeenCalled();
  });
});
