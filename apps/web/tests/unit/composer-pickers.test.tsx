/**
 * Composer `/` and `@` pickers (gact-tui#334).
 *
 * Both are backed: `/` lists slash commands (client.commands()), `@` lists
 * workspace files (client.workspaceFiles()). Neither invents a capability.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Composer } from '../../src/composer/Composer';

const COMMANDS = [
  { id: 'compact', label: '/compact', detail: 'Compact the context' },
  { id: 'clear', label: '/clear', detail: 'Clear the session' },
  { id: 'export', label: '/export', detail: 'Export the transcript' },
];

const FILES = [
  { id: 'src/App.tsx', label: 'App.tsx', detail: 'src/' },
  { id: 'src/kit/Modal.tsx', label: 'Modal.tsx', detail: 'src/kit/' },
];

function renderComposer(overrides: Partial<Parameters<typeof Composer>[0]> = {}) {
  return render(
    <Composer
      models={[{ id: 'm', label: 'model' }]}
      modelId="m"
      onModelChange={vi.fn()}
      onSubmit={vi.fn()}
      commands={COMMANDS}
      files={FILES}
      {...overrides}
    />,
  );
}

function type(value: string) {
  const box = screen.getByRole('textbox');
  fireEvent.change(box, { target: { value } });
  return box;
}

describe('slash picker', () => {
  it('opens when the message starts with /', () => {
    renderComposer();
    type('/');
    expect(screen.getByRole('listbox', { name: /commands/i })).toBeInTheDocument();
  });

  it('filters as you keep typing', () => {
    renderComposer();
    type('/comp');
    const list = screen.getByRole('listbox', { name: /commands/i });
    expect(within(list).getByText('/compact')).toBeInTheDocument();
    expect(within(list).queryByText('/clear')).toBeNull();
  });

  it('does NOT open for a slash mid-message', () => {
    // `and/or` is prose, not a command.
    renderComposer();
    type('weigh this and/or that');
    expect(screen.queryByRole('listbox', { name: /commands/i })).toBeNull();
  });

  it('completes the message on selection', () => {
    renderComposer();
    type('/comp');
    fireEvent.click(screen.getByRole('option', { name: /compact/ }));
    expect(screen.getByRole('textbox')).toHaveValue('/compact ');
  });

  it('navigates with arrows and selects with Enter', () => {
    renderComposer();
    const box = type('/');
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(screen.getByRole('textbox')).toHaveValue('/clear ');
  });

  it('Enter does not submit while the picker is open', () => {
    const onSubmit = vi.fn();
    renderComposer({ onSubmit });
    const box = type('/comp');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('closes on Escape and leaves the text alone', () => {
    renderComposer();
    const box = type('/comp');
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(screen.queryByRole('listbox', { name: /commands/i })).toBeNull();
    expect(screen.getByRole('textbox')).toHaveValue('/comp');
  });

  it('says so when nothing matches rather than showing an empty list', () => {
    renderComposer();
    type('/zzzz');
    expect(screen.getByTestId('picker-empty')).toBeInTheDocument();
  });
});

describe('at picker', () => {
  it('opens on @ and completes a file reference', () => {
    renderComposer();
    type('look at @Mod');
    const list = screen.getByRole('listbox', { name: /files/i });
    expect(within(list).getByText('Modal.tsx')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: /Modal/ }));
    expect(screen.getByRole('textbox')).toHaveValue('look at @src/kit/Modal.tsx ');
  });

  it('opens away from position 0, unlike the slash picker', () => {
    // `@` references a file anywhere in a sentence; `/` only commands a turn.
    renderComposer();
    type('compare @App');
    expect(screen.getByRole('listbox', { name: /files/i })).toBeInTheDocument();
  });

  it('closes once the reference is finished and typing moves on', () => {
    // The picker follows the caret. A completed token is not a live query.
    renderComposer();
    type('compare @App with the other');
    expect(screen.queryByRole('listbox', { name: /files/i })).toBeNull();
  });
});

describe('picker availability', () => {
  it('does not open a picker the surface has no data for', () => {
    // No commands supplied means the backend could not serve them; opening an
    // empty picker would suggest the feature is broken rather than absent.
    renderComposer({ commands: [] });
    type('/');
    expect(screen.queryByRole('listbox', { name: /commands/i })).toBeNull();
  });
});
