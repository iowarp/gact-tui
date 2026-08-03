/**
 * InlineEdit contract (gact-tui#331 kit, used by #332).
 *
 * The prototype renames in place in TWO surfaces — the topbar title and each
 * rail row — with identical behaviour and different metrics. That is a kit
 * primitive, not two implementations.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InlineEdit } from '../../src/kit';

describe('InlineEdit', () => {
  it('shows the value as text until it is asked to edit', () => {
    render(<InlineEdit value="LA ground motion" label="Session title" onCommit={vi.fn()} />);
    expect(screen.getByText('LA ground motion')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('enters edit mode on click and preselects the current value', () => {
    render(<InlineEdit value="LA ground motion" label="Session title" onCommit={vi.fn()} />);
    fireEvent.click(screen.getByText('LA ground motion'));
    expect(screen.getByRole('textbox')).toHaveValue('LA ground motion');
  });

  it('commits on Enter', () => {
    const onCommit = vi.fn();
    render(<InlineEdit value="old" label="Session title" onCommit={onCommit} />);
    fireEvent.click(screen.getByText('old'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'new title' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('new title');
  });

  it('cancels on Escape without committing', () => {
    const onCommit = vi.fn();
    render(<InlineEdit value="old" label="Session title" onCommit={onCommit} />);
    fireEvent.click(screen.getByText('old'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'discarded' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByText('old')).toBeInTheDocument();
  });

  it('commits on blur, because clicking away is an accept elsewhere in the app', () => {
    const onCommit = vi.fn();
    render(<InlineEdit value="old" label="Session title" onCommit={onCommit} />);
    fireEvent.click(screen.getByText('old'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'blurred' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('blurred');
  });

  it('does NOT commit an unchanged value', () => {
    // A no-op rename would still cost a round trip and a wire event.
    const onCommit = vi.fn();
    render(<InlineEdit value="same" label="Session title" onCommit={onCommit} />);
    fireEvent.click(screen.getByText('same'));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('refuses to commit an empty title', () => {
    // The prototype has no empty-name state; a blank row would be unusable.
    const onCommit = vi.fn();
    render(<InlineEdit value="old" label="Session title" onCommit={onCommit} />);
    fireEvent.click(screen.getByText('old'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('carries its size variant so each surface keeps its own metrics', () => {
    const { container } = render(
      <InlineEdit value="x" label="Session title" size="rail" onCommit={vi.fn()} />,
    );
    expect(container.querySelector('.kit-inlineedit')).toHaveAttribute('data-size', 'rail');
  });

  it('is reachable by keyboard, not click-only', () => {
    render(<InlineEdit value="old" label="Session title" onCommit={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /rename/i });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });
});
