import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ClioPathPicker } from './path-picker';

const native = vi.hoisted(() => ({ enabled: false, open: vi.fn() }));
vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => native.enabled }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: native.open }));

function Picker({ disabled = false }: { disabled?: boolean }) {
  const [path, setPath] = useState('C:\\Research');
  return (
    <ClioPathPicker
      inputLabel="Research folder"
      value={path}
      onChange={setPath}
      disabled={disabled}
      knownFolders={[{ name: 'Shared', path: 'C:\\Shared' }]}
    />
  );
}

beforeEach(() => {
  native.enabled = false;
  native.open.mockReset();
});
afterEach(cleanup);

it('allows direct paste and uses the same input for browser folder selection', async () => {
  const user = userEvent.setup();
  render(<Picker />);
  const input = screen.getByRole('textbox', { name: 'Research folder' });
  await user.clear(input);
  await user.paste('C:\\Documents\\Final_thesis');
  expect(input).toHaveValue('C:\\Documents\\Final_thesis');
  expect(screen.getAllByRole('textbox')).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Browse' }));
  await user.click(screen.getByText('Shared'));
  await user.click(screen.getByRole('button', { name: 'Use this folder' }));
  expect(input).toHaveValue('C:\\Shared');
  expect(screen.getAllByRole('textbox')).toHaveLength(1);
});

it('updates the same editable input from the native desktop picker', async () => {
  native.enabled = true;
  native.open.mockResolvedValue('C:\\Chosen');
  const user = userEvent.setup();
  render(<Picker />);
  await user.click(screen.getByRole('button', { name: 'Browse' }));
  expect(native.open).toHaveBeenCalledWith({ directory: true, multiple: false });
  expect(screen.getByRole('textbox', { name: 'Research folder' })).toHaveValue('C:\\Chosen');
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('disables both direct entry and browsing while its operation is pending', () => {
  render(<Picker disabled />);
  expect(screen.getByRole('textbox', { name: 'Research folder' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Browse' })).toBeDisabled();
});
