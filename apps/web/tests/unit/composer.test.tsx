/**
 * Composer contract (gact-tui#334) + the user-bubble correction to #333.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Composer } from '../../src/composer/Composer';

function renderComposer(overrides: Partial<Parameters<typeof Composer>[0]> = {}) {
  const props = {
    placement: 'ares:/scratch/j4471',
    asyncCount: 2,
    contextPercent: 41,
    models: [
      { id: 'sonnet', label: 'claude-sonnet-5', detail: 'Anthropic' },
      { id: 'opus', label: 'claude-opus-5', detail: 'Anthropic' },
    ],
    modelId: 'sonnet',
    onModelChange: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<Composer {...props} />) };
}

describe('Composer', () => {
  it('shows the placement, async and context chips', () => {
    renderComposer();
    expect(screen.getByText('ares:/scratch/j4471')).toBeInTheDocument();
    expect(screen.getByText(/async 2/)).toBeInTheDocument();
    expect(screen.getByText(/ctx 41%/)).toBeInTheDocument();
  });

  it('cannot submit an empty message', () => {
    const onSubmit = vi.fn();
    renderComposer({ onSubmit });
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('cannot submit whitespace only', () => {
    const onSubmit = vi.fn();
    renderComposer({ onSubmit });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   \n  ' } });
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits text with the active mode and clears the field', () => {
    const onSubmit = vi.fn();
    renderComposer({ onSubmit });
    const box = screen.getByRole('textbox');
    fireEvent.change(box, { target: { value: 'plot the station' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    expect(onSubmit).toHaveBeenCalledWith({ text: 'plot the station', mode: 'ask' });
    expect(box).toHaveValue('');
  });

  it('sends on Enter and inserts a newline on Shift+Enter', () => {
    const onSubmit = vi.fn();
    renderComposer({ onSubmit });
    const box = screen.getByRole('textbox');
    fireEvent.change(box, { target: { value: 'go' } });
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith({ text: 'go', mode: 'ask' });
  });

  it('switches between ask and execute modes', () => {
    const onSubmit = vi.fn();
    renderComposer({ onSubmit });
    fireEvent.click(screen.getByRole('button', { name: /execute/i }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'run it' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith({ text: 'run it', mode: 'execute' });
  });

  it('picks a model through the kit select', () => {
    const onModelChange = vi.fn();
    renderComposer({ onModelChange });
    fireEvent.click(screen.getByRole('combobox', { name: /model/i }));
    fireEvent.click(screen.getByRole('option', { name: /claude-opus-5/ }));
    expect(onModelChange).toHaveBeenCalledWith('opus');
  });

  it('blocks input and says why while the turn is busy', () => {
    // No silent no-op: a disabled composer must state its reason.
    renderComposer({ busy: true, busyReason: 'turn in progress' });
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByTestId('composer-busy')).toHaveTextContent('turn in progress');
  });
});

describe('Shift+Tab expand (S2)', () => {
  // Not in the bundled prototype export — `'Tab'` appears nowhere in it — but
  // the owner added it deliberately to the design, so it is built to spec.
  it('starts collapsed', () => {
    render(<Composer models={[]} modelId="" onModelChange={() => {}} onSubmit={() => {}} />);
    expect(screen.getByTestId('composer-frame')).not.toHaveAttribute('data-expanded');
  });

  it('expands on Shift+Tab and collapses on a second press', () => {
    render(<Composer models={[]} modelId="" onModelChange={() => {}} onSubmit={() => {}} />);
    const input = screen.getByRole('textbox');

    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });
    expect(screen.getByTestId('composer-frame')).toHaveAttribute('data-expanded', 'true');

    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });
    expect(screen.getByTestId('composer-frame')).not.toHaveAttribute('data-expanded');
  });

  it('does not expand on a plain Tab, which must still move focus', () => {
    render(<Composer models={[]} modelId="" onModelChange={() => {}} onSubmit={() => {}} />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Tab' });
    expect(screen.getByTestId('composer-frame')).not.toHaveAttribute('data-expanded');
  });

  it('keeps the typed text across an expand', () => {
    render(<Composer models={[]} modelId="" onModelChange={() => {}} onSubmit={() => {}} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'half a thought' } });
    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('textbox')).toHaveValue('half a thought');
  });
})
