import { render, screen, cleanup, fireEvent, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionListItem } from '../../src/components/SessionListItem.js';
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
  preview: 'ranked stations near San Diego',
  model: 'gemma4',
  costUsd: 0.01234,
  pinned: true,
};

describe('SessionListItem', () => {
  it('renders title, preview, metadata, and selects the row', () => {
    const onSelect = vi.fn();
    render(() => (
      <SessionListItem
        row={row}
        workspaceLabel="ALCF"
        active={false}
        onSelect={onSelect}
      />
    ));

    expect(screen.getByText('EarthScope run')).toBeTruthy();
    expect(screen.getByText('ranked stations near San Diego')).toBeTruthy();
    expect(screen.getByText('ALCF')).toBeTruthy();
    expect(screen.getByText('gemma4')).toBeTruthy();
    expect(screen.getByText('$0.012')).toBeTruthy();
    expect(screen.getByTestId('session-row-pinned-session-1')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Open EarthScope run'));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('commits a meaningful inline rename', async () => {
    const onRename = vi.fn();
    render(() => (
      <SessionListItem
        row={row}
        active={false}
        onSelect={() => undefined}
        onRename={onRename}
      />
    ));

    fireEvent.dblClick(screen.getByText('EarthScope run'));
    const input = await screen.findByDisplayValue('EarthScope run');
    fireEvent.input(input, { target: { value: 'Updated run' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(onRename).toHaveBeenCalledWith('Updated run'));
  });
});
