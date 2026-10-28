import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { copyText } from '@/lib/clipboard';
import { TextFileCopyAction } from './text-file-copy-action';

vi.mock('@/lib/clipboard', () => ({ copyText: vi.fn(async () => {}) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('keeps empty file copying valid and reports denied clipboard access', async () => {
  const user = userEvent.setup();
  render(<TextFileCopyAction name="empty.md" readText={() => ''} />);
  const copy = screen.getByRole('button', { name: 'Copy empty.md' });
  await user.click(copy);
  expect(copyText).toHaveBeenCalledWith('');
  expect(copy).toHaveTextContent('Copied');
  expect(toast.success).not.toHaveBeenCalled();
  vi.mocked(copyText).mockRejectedValueOnce(new Error('Clipboard denied'));
  await user.click(copy);
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Clipboard denied'));
  expect(copy).toBeEnabled();
});

it('never copies an unavailable representation or enables loading source', async () => {
  const user = userEvent.setup();
  const { rerender } = render(
    <TextFileCopyAction name="agenda.md" readText={() => undefined} disabled />,
  );
  const copy = screen.getByRole('button', { name: 'Copy agenda.md' });
  expect(copy).toBeDisabled();
  rerender(<TextFileCopyAction name="agenda.md" readText={() => undefined} />);
  await user.click(copy);
  expect(copyText).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith('The file text is not available yet.');
});

it('awaits an asynchronous rendered-text reader before copying', async () => {
  const user = userEvent.setup();
  render(<TextFileCopyAction name="rendered.html" readText={async () => 'Visible page text'} />);

  await user.click(screen.getByRole('button', { name: 'Copy rendered.html' }));

  await waitFor(() => expect(copyText).toHaveBeenCalledWith('Visible page text'));
});

it('reports an asynchronous text-reader failure without copying', async () => {
  const user = userEvent.setup();
  render(
    <TextFileCopyAction
      name="rendered.html"
      readText={async () => {
        throw new Error('Rendered preview text is too large to copy.');
      }}
    />,
  );

  await user.click(screen.getByRole('button', { name: 'Copy rendered.html' }));

  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith('Rendered preview text is too large to copy.'),
  );
  expect(copyText).not.toHaveBeenCalled();
});
