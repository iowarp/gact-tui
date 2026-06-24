import { render, screen, cleanup, fireEvent } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionListItemMenu } from '../../src/components/SessionListItemMenu.js';
import type { SessionRow } from '../../src/components/SessionsColumnModel.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const row: SessionRow = {
  id: 'session-1',
  title: 'EarthScope run',
  status: 'idle',
  updatedAt: '2m',
};

describe('SessionListItemMenu', () => {
  it('closes and starts rename from the rename action', () => {
    const onClose = vi.fn();
    const onStartRename = vi.fn();
    render(() => (
      <SessionListItemMenu
        row={row}
        open
        onClose={onClose}
        onStartRename={onStartRename}
        onRename={() => {}}
      />
    ));

    fireEvent.click(screen.getByText('Rename'));
    expect(onClose).toHaveBeenCalled();
    expect(onStartRename).toHaveBeenCalled();
  });

  it('renders the current pin action and closes before toggling', () => {
    const onClose = vi.fn();
    const onTogglePin = vi.fn();
    render(() => (
      <SessionListItemMenu
        row={{ ...row, pinned: true }}
        open
        onClose={onClose}
        onStartRename={() => {}}
        onTogglePin={onTogglePin}
      />
    ));

    fireEvent.click(screen.getByText('Unpin'));
    expect(onClose).toHaveBeenCalled();
    expect(onTogglePin).toHaveBeenCalled();
  });

  it('confirms before deleting a session', () => {
    const onClose = vi.fn();
    const onDelete = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(() => (
      <SessionListItemMenu
        row={row}
        open
        onClose={onClose}
        onStartRename={() => {}}
        onDelete={onDelete}
      />
    ));

    fireEvent.click(screen.getByText('Delete'));
    expect(window.confirm).toHaveBeenCalledWith(
      'Delete the session "EarthScope run"? This cannot be undone.',
    );
    expect(onClose).toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalled();
  });
});
