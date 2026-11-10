import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FileViewerFactsRegistry } from './file-viewer-facts';
import {
  ResourceLoading,
  ResourceUnavailable,
  ViewerNoPreview,
  ViewerReadError,
  ViewerTooLarge,
} from './resource-states';

const { repository } = vi.hoisted(() => ({
  repository: { readWorkspaceFileBytes: vi.fn() },
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function framed(setFacts: ReturnType<typeof vi.fn> | null = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Frame({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <TooltipProvider>
          {setFacts ? (
            <FileViewerFactsRegistry.Provider value={setFacts}>
              {children}
            </FileViewerFactsRegistry.Provider>
          ) : (
            children
          )}
        </TooltipProvider>
      </QueryClientProvider>
    );
  };
}

const binary = {
  kind: 'workspace',
  workspaceId: 'workspace_1',
  path: 'data/forecast.GRIB2',
  mediaType: 'application/octet-stream',
  size: 2_100_000_000,
} as const;

describe('ResourceLoading', () => {
  it('is a busy status named and labelled by its label', () => {
    render(<ResourceLoading label="Loading preview" />);
    const status = screen.getByRole('status', { name: 'Loading preview' });
    expect(status).toHaveAttribute('aria-busy', 'true');
    // The wait is worded, not shown only as a pulse.
    expect(status).toHaveTextContent('Loading preview');
    const bars = status.querySelectorAll('[data-slot="skeleton"]');
    expect(bars).toHaveLength(3);
    for (const bar of bars) expect(bar.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('has a compact line variant for inline spots', () => {
    render(<ResourceLoading label="Loading folder" variant="line" />);
    const status = screen.getByRole('status', { name: 'Loading folder' });
    expect(status).toHaveTextContent('Loading folder');
    expect(status.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0);
  });

  it('is the viewer state under a frame bar, still named for assistive tech', () => {
    render(<ResourceLoading label="Loading soil_moisture.h5" />, { wrapper: framed() });
    const status = screen.getByRole('status', { name: 'Loading soil_moisture.h5' });
    expect(status).toHaveAttribute('data-size', 'viewer');
    expect(status).toHaveAttribute('aria-busy', 'true');
  });
});

describe('viewer states', () => {
  it('keeps the bordered card outside a frame and the compact state inside one', () => {
    const { unmount } = render(<ResourceUnavailable detail="Gone." label="Preview unavailable" />);
    expect(document.querySelector('[data-slot="state-view"]')).toBeNull();
    expect(screen.getByText('Preview unavailable')).toBeVisible();
    unmount();
    render(<ResourceUnavailable detail="Gone." label="Preview unavailable" />, {
      wrapper: framed(),
    });
    const state = document.querySelector('[data-slot="state-view"]');
    expect(state).toHaveAttribute('data-size', 'viewer');
    expect(state).toHaveTextContent('Preview unavailable');
    expect(state).toHaveTextContent('Gone.');
  });

  it("says Couldn't read it with the reason and a named Retry icon", async () => {
    const onRetry = vi.fn();
    render(<ViewerReadError error="file not found: run.h5" onRetry={onRetry} />, {
      wrapper: framed(),
    });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("Couldn't read it");
    expect(alert).toHaveTextContent('file not found: run.h5');
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows a too-large file by its size, in words, with Preview and Download', async () => {
    repository.readWorkspaceFileBytes.mockResolvedValue(new Uint8Array([1]));
    const onPreview = vi.fn();
    render(<ViewerTooLarge onPreview={onPreview} source={binary} />, { wrapper: framed() });
    const state = document.querySelector('[data-kind="too-large"]') as HTMLElement;
    expect(state).toHaveTextContent('2.1 GB');
    expect(state).toHaveTextContent('Too large to preview');
    expect(
      within(state)
        .getAllByRole('button')
        .map((button) => button.ariaLabel),
    ).toEqual(['Preview', 'Download']);
    await userEvent.click(within(state).getByRole('button', { name: 'Preview' }));
    expect(onPreview).toHaveBeenCalledTimes(1);
    await userEvent.click(within(state).getByRole('button', { name: 'Download' }));
    await waitFor(() =>
      expect(repository.readWorkspaceFileBytes).toHaveBeenCalledWith(
        'workspace_1',
        'data/forecast.GRIB2',
      ),
    );
  });

  it('names the format of a file with no preview, adds it to the frame facts and offers Download', () => {
    const setFacts = vi.fn();
    render(<ViewerNoPreview source={binary} />, { wrapper: framed(setFacts) });
    const state = document.querySelector('[data-kind="no-preview"]') as HTMLElement;
    expect(state).toHaveTextContent('.grib2');
    expect(state).toHaveTextContent('No preview for this format');
    // A browser has no app for the format, so Download is the way out.
    expect(
      within(state)
        .getAllByRole('button')
        .map((button) => button.ariaLabel),
    ).toEqual(['Download']);
    expect(setFacts).toHaveBeenCalledWith(expect.any(String), ['.grib2']);
  });

  it('offers Open beside Download when the browser can show the file', () => {
    render(<ViewerNoPreview source={{ ...binary, path: 'clip.webm', mediaType: 'video/webm' }} />, {
      wrapper: framed(),
    });
    const state = document.querySelector('[data-kind="no-preview"]') as HTMLElement;
    expect(
      within(state)
        .getAllByRole('button')
        .map((button) => button.ariaLabel),
    ).toEqual(['Open in a browser tab', 'Download']);
  });
});
