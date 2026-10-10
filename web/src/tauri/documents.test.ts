import { beforeEach, expect, it, vi } from 'vitest';
import {
  documentApplications,
  openFileBytes,
  openDocumentWorkingCopy,
  revealFileBytes,
} from './documents';

const native = vi.hoisted(() => ({ available: true, invoke: vi.fn() }));
vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => native.available }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke }));
beforeEach(() => {
  native.available = true;
  native.invoke.mockReset();
});

it('passes exact bytes to confined native staging and folder commands', async () => {
  const bytes = new Uint8Array([0, 10, 255]);
  native.invoke.mockResolvedValue('local-copy');
  await expect(openFileBytes('raccoon.html', bytes, 'os-chrome')).resolves.toBe('local-copy');
  expect(native.invoke).toHaveBeenLastCalledWith('open_file_bytes', {
    name: 'raccoon.html',
    bytes: [0, 10, 255],
    application: 'os-chrome',
  });
  await revealFileBytes('raccoon.html', bytes);
  expect(native.invoke).toHaveBeenLastCalledWith('reveal_file_bytes', {
    name: 'raccoon.html',
    bytes: [0, 10, 255],
  });
});

it('makes native string failures readable by document action error panels', async () => {
  native.invoke.mockRejectedValue('Open the selected app: access denied');
  await expect(openFileBytes('raccoon.html', new Uint8Array(), 'os-chrome')).rejects.toThrow(
    'Open the selected app: access denied',
  );
  await expect(openDocumentWorkingCopy('copy.html', 'os-chrome')).rejects.toThrow(
    'Open the selected app: access denied',
  );
  await expect(revealFileBytes('raccoon.html', new Uint8Array())).rejects.toThrow(
    'Open the selected app: access denied',
  );
});

it('does not offer desktop actions in the web host', async () => {
  native.available = false;
  await expect(documentApplications('raccoon.html', 'text/html')).resolves.toEqual([]);
  await expect(revealFileBytes('raccoon.html', new Uint8Array())).rejects.toThrow(
    'requires the desktop',
  );
  expect(native.invoke).not.toHaveBeenCalled();
});
