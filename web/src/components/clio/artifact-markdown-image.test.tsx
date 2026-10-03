import type { Artifact } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/components/ai-elements/markdown';
import { GroundedMessageResponse } from './grounded-message-response';
import { PresentationNavigation } from './presentation-navigation';

const repository = vi.hoisted(() => ({ readArtifactBytesFor: vi.fn() }));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://localhost:17954' } }),
}));
const artifact: Artifact = {
  id: 'artifact_figure', session_id: 's', name: 'figure.png', media_type: 'image/png',
  size: 4096, uri: 'artifact://artifact_figure',
};
beforeEach(() => {
  repository.readArtifactBytesFor.mockResolvedValue(new Uint8Array([137, 80, 78, 71]));
  class PreviewURL extends URL {
    static createObjectURL = vi.fn(() => 'blob:registered-image');
    static revokeObjectURL = vi.fn();
  }
  vi.stubGlobal('URL', PreviewURL);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

function response(text: string, artifacts: Record<string, Artifact> = { [artifact.id]: artifact }) {
  const open = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PresentationNavigation.Provider value={{ artifacts, subagents: {}, onOpenArtifact: open }}>
        <GroundedMessageResponse mode="static">{text}</GroundedMessageResponse>
      </PresentationNavigation.Provider>
    </QueryClientProvider>,
  );
  return open;
}
describe('registered artifact Markdown images', () => {
  it('reads registered bytes and opens the same artifact from the visible figure', async () => {
    const open = response('Result\n\n![Storm figure](artifact://artifact_figure)');
    expect(await screen.findByRole('img', { name: 'Storm figure' })).toHaveAttribute('src', 'blob:registered-image');
    expect(repository.readArtifactBytesFor).toHaveBeenCalledWith(artifact, expect.any(AbortSignal));
    fireEvent.click(screen.getByRole('button', { name: 'Open figure.png' }));
    expect(open).toHaveBeenCalledWith(artifact);
    expect(screen.queryByText(/Image blocked/u)).not.toBeInTheDocument();
  });
  it('does not fetch an unregistered artifact reference', async () => {
    response('![Missing figure](artifact://missing)', {});
    expect(await screen.findByText(/Saved image reference unavailable/u)).toBeVisible();
    expect(repository.readArtifactBytesFor).not.toHaveBeenCalled();
  });
  it('rejects a registered non-image artifact as an inline image', async () => {
    response('![Not an image](artifact://artifact_figure)', {
      [artifact.id]: { ...artifact, media_type: 'text/plain' },
    });
    expect(await screen.findByText(/Saved image reference unavailable/u)).toBeVisible();
    expect(repository.readArtifactBytesFor).not.toHaveBeenCalled();
  });
  it('preserves ordinary image sanitization and code examples', async () => {
    response('![Remote](https://example.com/figure.png)\n\n![Unsafe](javascript:alert)\n\n`![Example](artifact://missing)`');
    expect(await screen.findByRole('img', { name: 'Remote' })).toHaveAttribute('src', 'https://example.com/figure.png');
    expect(screen.queryByRole('img', { name: 'Unsafe' })).not.toBeInTheDocument();
    expect(screen.getByText('![Example](artifact://missing)')).toBeVisible();
    expect(repository.readArtifactBytesFor).not.toHaveBeenCalled();
  });
});
