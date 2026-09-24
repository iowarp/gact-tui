import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptInputProvider } from '@/components/ai-elements/prompt-input';
import { ClioComposer } from './composer';

// Split out of composer.test.tsx to keep that file under the frontend
// file-size ratchet (scripts/check_frontend_file_size.mjs) — these tests
// exercise a single, separable concern (local attachment previews reading
// from the File object rather than re-fetching the blob: URL) and do not
// need composer.test.tsx's broader command/queue/behavior fixtures.

const repositoryMocks = vi.hoisted(() => ({
  workspaceReferences: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repositoryMocks }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://clio.test' } }),
}));
// jsdom has no DOMMatrix/Canvas, which the real viewer's pdf.js dependency
// needs even just to import — matching resource-viewers.test.tsx and
// workspace-resource-view.test.tsx's own mock of this same component.
vi.mock('./document-pdf-viewer', () => ({
  ClioDocumentPdfViewer: ({ name }: { name: string }) => (
    <div data-testid="pdf-viewer-mock">{name}</div>
  ),
}));

afterEach(cleanup);

beforeEach(() => {
  repositoryMocks.workspaceReferences.mockReset();
  repositoryMocks.workspaceReferences.mockResolvedValue([]);
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string): MediaQueryList => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
      matches: true,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }),
    writable: true,
  });
});

function renderComposer() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <PromptInputProvider>
        <ClioComposer
          attachments
          commands={[]}
          effort="medium"
          model="gpt-5.6-luna"
          onCommand={vi.fn(async () => undefined)}
          onStop={vi.fn()}
          onSubmit={vi.fn(async () => undefined)}
          provider="codex"
          state="completed"
        />
      </PromptInputProvider>
    </QueryClientProvider>,
  );
}

describe('ClioComposer local attachment previews', () => {
  it('opens PDF attachments in a near-fullscreen reading canvas', async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.upload(
      screen.getByLabelText('Upload files'),
      new File(['%PDF-content'], 'paper.pdf', { type: 'application/pdf' }),
    );
    await user.click(screen.getByRole('button', { name: 'Open paper.pdf' }));

    expect(screen.getByRole('dialog')).toHaveClass(
      'h-[calc(100dvh-1rem)]',
      'w-[min(90rem,calc(100vw-1rem))]',
    );
  });

  it('previews a text attachment from its File object rather than fetching the blob: URL', async () => {
    // jsdom's fetch has no blob: scheme handler at all, so a preview that
    // still fetched file.url (as this one used to) would fail exactly the
    // way the desktop CSP fails it for real -- reading from the File the
    // attachment already carries must work regardless.
    const user = userEvent.setup();
    renderComposer();

    await user.upload(
      screen.getByLabelText('Upload files'),
      new File(['calibration pending'], 'field-notes.md', { type: 'text/markdown' }),
    );
    await user.click(screen.getByRole('button', { name: 'Open field-notes.md' }));

    expect(await screen.findByText('calibration pending')).toBeVisible();
    expect(screen.queryByText(/could not be read/i)).not.toBeInTheDocument();
  });

  it('previews a PDF attachment from its File object rather than fetching the blob: URL', async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.upload(
      screen.getByLabelText('Upload files'),
      new File(['%PDF-content'], 'paper.pdf', { type: 'application/pdf' }),
    );
    await user.click(screen.getByRole('button', { name: 'Open paper.pdf' }));

    // A preview that still fetched file.url would reject (jsdom's fetch has
    // no blob: scheme handler) and never get past "Loading PDF…" to the
    // (mocked, see above) viewer at all.
    expect(await screen.findByTestId('pdf-viewer-mock')).toHaveTextContent('paper.pdf');
    expect(screen.queryByText(/could not be read|fetch failed/i)).not.toBeInTheDocument();
  });
});
