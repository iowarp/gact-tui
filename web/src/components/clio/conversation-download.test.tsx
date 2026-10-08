import type { UIMessage } from 'ai';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ConversationDownload } from '@/components/ai-elements/conversation';

const nativeDownloads = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/tauri/downloads', () => ({ openDownloads: nativeDownloads }));
const messages: UIMessage[] = [
  { id: 'user', role: 'user', parts: [{ type: 'text', text: 'Explain the result.' }] },
  { id: 'assistant', role: 'assistant', parts: [{ type: 'text', text: 'Here is the result.' }] },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  nativeDownloads.mockClear();
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
});

it.each([true, false])('downloads readable Markdown on desktop=%s', async (desktop) => {
  if (desktop)
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} });
  let downloaded: Blob | undefined;
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    downloaded = blob as Blob;
    return 'blob:conversation';
  });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    expect(this.download).toBe('review.md');
    expect(this.referrerPolicy).toBe('no-referrer');
  });
  render(
    <ConversationDownload
      aria-label="Download Markdown"
      filename="review.md"
      messages={messages}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Download Markdown' }));
  expect(click).toHaveBeenCalledTimes(1);
  expect(nativeDownloads).not.toHaveBeenCalled();
  expect(downloaded?.type).toBe('text/markdown');
  const content = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(downloaded!);
  });
  expect(content).toBe('**User:** Explain the result.\n\n**Assistant:** Here is the result.');
  expect(document.querySelector('a[download]')).toBeNull();
});
