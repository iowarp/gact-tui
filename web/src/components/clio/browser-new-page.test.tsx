import type { BrowserPage } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserNewPage } from './browser-new-page';
import { normalizeBrowserAddress } from './use-browser-pages';

const { repository } = vi.hoisted(() => ({
  repository: { openBrowserPage: vi.fn() },
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const page: BrowserPage = {
  id: 'page_1',
  session_id: 's1',
  url: 'https://example.org/',
  title: 'Example',
  host: 'example.org',
} as BrowserPage;

function renderNewPage() {
  const onOpened = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const view = render(
    <QueryClientProvider client={client}>
      <BrowserNewPage onOpened={onOpened} sessionId="s1" />
    </QueryClientProvider>,
  );
  return { onOpened, invalidate, ...view };
}

describe('normalizeBrowserAddress', () => {
  it('opens web addresses and adds the scheme a bare host leaves out', () => {
    expect(normalizeBrowserAddress('example.org/maps')).toBe('https://example.org/maps');
    expect(normalizeBrowserAddress(' https://ndp.example/x ')).toBe('https://ndp.example/x');
    expect(normalizeBrowserAddress('localhost:8000')).toBe('http://localhost:8000/');
    expect(normalizeBrowserAddress('127.0.0.1:5173/app')).toBe('http://127.0.0.1:5173/app');
  });

  it('refuses what the shared browser cannot open', () => {
    expect(normalizeBrowserAddress('')).toBeUndefined();
    expect(normalizeBrowserAddress('soil moisture')).toBeUndefined();
    expect(normalizeBrowserAddress('file:///etc/passwd')).toBeUndefined();
    expect(normalizeBrowserAddress('javascript://alert(1)')).toBeUndefined();
    expect(normalizeBrowserAddress('notes')).toBeUndefined();
  });
});

describe('BrowserNewPage', () => {
  it('is the browser frame with its address field focused', () => {
    renderNewPage();
    expect(screen.getByRole('textbox', { name: 'Address' })).toHaveFocus();
    const back = screen.getByRole('button', { name: 'Back' });
    expect(back).toHaveAttribute('aria-disabled', 'true');
    expect(back).toHaveAccessibleDescription('Open a page first');
  });

  it('opens the address in the shared browser, then as a tab', async () => {
    const user = userEvent.setup();
    repository.openBrowserPage.mockResolvedValue(page);
    const { onOpened, invalidate } = renderNewPage();
    await user.type(screen.getByRole('textbox', { name: 'Address' }), 'example.org{Enter}');
    expect(repository.openBrowserPage).toHaveBeenCalledWith('s1', 'https://example.org/');
    await vi.waitFor(() => expect(onOpened).toHaveBeenCalledWith(page));
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['browser-pages', 'http://127.0.0.1:8790', 's1'],
    });
  });

  it('says why an address did not open and keeps it for a fix', async () => {
    const user = userEvent.setup();
    repository.openBrowserPage.mockRejectedValue(new Error('The browser is not running.'));
    const { onOpened } = renderNewPage();
    const field = screen.getByRole('textbox', { name: 'Address' });
    await user.type(field, 'not an address{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a web address');
    expect(repository.openBrowserPage).not.toHaveBeenCalled();

    await user.clear(field);
    await user.type(field, 'example.org{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('The browser is not running.');
    expect(screen.getByRole('textbox', { name: 'Address' })).toHaveValue('example.org');
    expect(onOpened).not.toHaveBeenCalled();
  });
});
