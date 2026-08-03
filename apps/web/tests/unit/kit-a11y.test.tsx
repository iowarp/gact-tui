/**
 * Kit accessibility contract.
 *
 * These behaviours belong to the PRIMITIVE, not to its callers — that is the
 * point of having a kit. If focus handling lived in each surface, some surface
 * would eventually forget it.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Eyebrow, KvGrid, Modal, PartCard } from '../../src/kit';

function OpenModal(props: { onClose?: () => void; scrollBody?: boolean }) {
  return (
    <Modal open title="Test dialog" onClose={props.onClose ?? (() => {})} {...props}>
      <button type="button">first</button>
      <button type="button">second</button>
    </Modal>
  );
}

describe('Modal', () => {
  it('is a labelled modal dialog', () => {
    render(<OpenModal />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Test dialog');
  });

  it('moves focus to the dialog itself on open, not to its close button', () => {
    render(<OpenModal />);
    // Focusing the first control would land on "Close" (it leads in DOM order).
    expect(screen.getByRole('dialog')).toHaveFocus();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<OpenModal onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes when the scrim is clicked', () => {
    const onClose = vi.fn();
    render(<OpenModal onClose={onClose} />);
    fireEvent.click(screen.getByTestId('modal-scrim'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  // Focus order inside the panel is [close, first, second] — the close button
  // leads because the header renders above the body.
  it('traps Tab at the end of the dialog', () => {
    render(<OpenModal />);
    const dialog = screen.getByRole('dialog');
    within(dialog).getByRole('button', { name: 'second' }).focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    // Wrapped back to the leading control rather than escaping to the page.
    expect(within(dialog).getByRole('button', { name: /close/i })).toHaveFocus();
  });

  it('traps Shift+Tab at the start of the dialog', () => {
    render(<OpenModal />);
    const dialog = screen.getByRole('dialog');
    within(dialog).getByRole('button', { name: /close/i }).focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(within(dialog).getByRole('button', { name: 'second' })).toHaveFocus();
  });

  it('restores focus to the invoker on close', () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            open
          </button>
          <Modal open={open} title="Test dialog" onClose={() => setOpen(false)}>
            <button type="button">inside</button>
          </Modal>
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'open' });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('dialog')).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(opener).toHaveFocus();
  });

  it('renders nothing when closed', () => {
    render(
      <Modal open={false} title="Test dialog" onClose={() => {}}>
        <p>body</p>
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps an accessible name when a custom header replaces the heading', () => {
    render(
      <Modal open title="Real name" header={<span>decorative</span>} onClose={() => {}}>
        <p>body</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Real name');
  });
});

describe('KvGrid', () => {
  it('preserves the key/value relationship semantically', () => {
    const { container } = render(
      <KvGrid label="Tool params" rows={[{ key: 'path', value: '/tmp/x.csv' }]} />,
    );
    expect(container.querySelector('dt')?.textContent).toBe('path');
    expect(container.querySelector('dd')?.textContent).toBe('/tmp/x.csv');
  });

  it('renders the trailing slot only when supplied', () => {
    const { container } = render(
      <KvGrid
        rows={[
          { key: 'rows', value: '1101', trailing: 'staged' },
          { key: 'path', value: '/tmp/x.csv' },
        ]}
      />,
    );
    expect(container.querySelectorAll('.kit-kvgrid__trailing')).toHaveLength(1);
  });
});

describe('PartCard', () => {
  it('hides an empty gutter from assistive tech', () => {
    const { container } = render(<PartCard>body</PartCard>);
    expect(container.querySelector('.kit-partcard__gutter')).toHaveAttribute('aria-hidden', 'true');
  });

  it('exposes the kind as a styling hook rather than a bespoke class', () => {
    const { container } = render(<PartCard kind="thinking">body</PartCard>);
    expect(container.querySelector('.kit-partcard')).toHaveAttribute('data-kind', 'thinking');
  });
});

describe('Eyebrow', () => {
  it('carries the tight letter-spacing variant as data, not a new class', () => {
    const { container } = render(<Eyebrow tight>tool</Eyebrow>);
    expect(container.querySelector('.kit-eyebrow')).toHaveAttribute('data-tight', 'true');
  });
});
