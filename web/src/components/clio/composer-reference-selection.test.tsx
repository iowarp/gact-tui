import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptInputProvider } from '@/components/ai-elements/prompt-input';
import type { InlineReferenceSelection } from '@/lib/composer-reference-domain';
import { ClioComposer, type ClioComposerProps } from './composer';

const repositoryMocks = vi.hoisted(() => ({
  workspaceReferences: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repositoryMocks }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://clio.test' } }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

afterEach(cleanup);

/** The composer's editor: a combobox because it drives the reference popover. */
function composerEditor(): HTMLElement {
  return screen.getByRole('combobox', { name: /investigate, build, explain, or act/ });
}

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

function renderComposer({
  onOpenReference,
  onSubmit = vi.fn(async () => undefined),
  state = 'completed',
}: {
  onOpenReference?: ClioComposerProps['onOpenReference'];
  onSubmit?: ClioComposerProps['onSubmit'];
  state?: 'completed' | 'running';
} = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <PromptInputProvider>
        <ClioComposer
          attachments={false}
          contextReferences
          effort="medium"
          model="gpt-5.6-luna"
          onOpenReference={onOpenReference}
          onSubmit={onSubmit}
          provider="codex"
          state={state}
          workspaceId="workspace_1"
        />
      </PromptInputProvider>
    </QueryClientProvider>,
  );
  return { onSubmit };
}

const artifactReference = {
  kind: 'artifact' as const,
  id: 'artifact_plot',
  label: 'Displacement plot',
  detail: 'Displacement plot v3 (image)',
  media_type: 'image/png',
  revision: 'v3',
  navigation: { artifact_id: 'artifact_plot' },
};

const readmeReference = {
  kind: 'workspace_file' as const,
  id: 'README.md',
  label: 'README.md',
  detail: 'README.md (400 bytes)',
  media_type: 'text/markdown',
  revision: 'stat:1:400',
  navigation: { path: 'README.md' },
};

describe('composer reference selection', () => {
  it('turns an @ selection into a structured reference and keeps it out of text', async () => {
    repositoryMocks.workspaceReferences.mockResolvedValue([artifactReference]);
    const user = userEvent.setup();
    const { onSubmit } = renderComposer();
    const input = composerEditor();

    await user.type(input, '@plot');
    await user.click(await screen.findByRole('option', { name: /Displacement plot/ }));

    expect(
      await screen.findByRole('button', { name: 'Open artifact Displacement plot' }),
    ).toBeVisible();
    await user.type(input, 'needs a clearer legend{Enter}');

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'needs a clearer legend',
          references: [
            {
              type: 'context_ref',
              ref_kind: 'artifact',
              ref_id: 'artifact_plot',
              label: 'Displacement plot',
              revision: 'v3',
            },
          ],
        }),
      ),
    );
  });

  it('accepts a direct browser click that omits pointer events', async () => {
    repositoryMocks.workspaceReferences.mockResolvedValue([artifactReference]);
    const user = userEvent.setup();
    renderComposer();

    await user.type(composerEditor(), '@plot');
    fireEvent.click(await screen.findByRole('option', { name: /Displacement plot/ }));

    expect(
      await screen.findByRole('button', { name: 'Open artifact Displacement plot' }),
    ).toBeVisible();
    expect(composerEditor()).toHaveTextContent('@Displacement plot');
  });

  it('does not clip the reference palette above the docked composer', async () => {
    repositoryMocks.workspaceReferences.mockResolvedValue([readmeReference]);
    const user = userEvent.setup();
    renderComposer();

    await user.type(composerEditor(), '@');
    await user.click(await screen.findByRole('button', { name: 'Expand Local files' }));
    await screen.findByRole('option', { name: /README.md/ });

    const stack = composerEditor().closest('[data-slot="clio-composer-stack"]');
    expect(stack).toHaveClass('overflow-visible');
    expect(stack).not.toHaveClass('overflow-hidden');
  });

  it('uses arrow keys and Enter to select a reference instead of submitting literal @ text', async () => {
    repositoryMocks.workspaceReferences.mockResolvedValue([
      readmeReference,
      {
        kind: 'artifact',
        id: 'artifact_notes',
        label: 'Review notes.md',
        detail: 'Review notes.md v2 (document)',
        media_type: 'text/markdown',
        revision: 'v2',
        navigation: { artifact_id: 'artifact_notes' },
      },
    ]);
    const user = userEvent.setup();
    const { onSubmit } = renderComposer();
    const input = composerEditor();

    await user.type(input, '@');
    await screen.findByRole('option', { name: /Review notes.md/ });
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.querySelector('input[name="message"]')).toHaveValue(' ');
    expect(screen.getByRole('button', { name: 'Open artifact Review notes.md' })).toBeVisible();

    await user.type(input, 'Make the conclusion clearer.{Enter}');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Make the conclusion clearer.',
        references: [
          {
            type: 'context_ref',
            ref_kind: 'artifact',
            ref_id: 'artifact_notes',
            label: 'Review notes.md',
            revision: 'v2',
          },
        ],
      }),
    );
  });

  it('keeps selected references across the composer remount the draft text survives', async () => {
    repositoryMocks.workspaceReferences.mockResolvedValue([artifactReference]);
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    // The welcome→docked flip re-keys the composer, which remounts it. The
    // draft owner outside the composer is what makes text survive that; the
    // references it carries have to survive it the same way.
    function DraftOwner() {
      const [draft, setDraft] = useState('');
      const [references, setReferences] = useState<readonly InlineReferenceSelection[]>([]);
      const [variant, setVariant] = useState<'docked' | 'welcome'>('welcome');
      return (
        <QueryClientProvider client={queryClient}>
          <button onClick={() => setVariant('docked')} type="button">
            Settle transcript
          </button>
          <PromptInputProvider key={variant}>
            <ClioComposer
              attachments={false}
              contextReferences
              effort="medium"
              key={variant}
              model="gpt-5.6-luna"
              onReferencesChange={setReferences}
              onSubmit={vi.fn(async () => undefined)}
              onValueChange={setDraft}
              provider="codex"
              references={references}
              state="completed"
              value={draft}
              variant={variant}
              workspaceId="workspace_1"
            />
          </PromptInputProvider>
        </QueryClientProvider>
      );
    }
    render(<DraftOwner />);

    await user.type(composerEditor(), '@plot');
    await user.click(await screen.findByRole('option', { name: /Displacement plot/ }));
    expect(
      await screen.findByRole('button', { name: 'Open artifact Displacement plot' }),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Settle transcript' }));

    expect(
      await screen.findByRole('button', { name: 'Open artifact Displacement plot' }),
    ).toBeVisible();
  });

  it('opens a selected reference from its typed token', async () => {
    repositoryMocks.workspaceReferences.mockResolvedValue([readmeReference]);
    const user = userEvent.setup();
    const onOpenReference = vi.fn();
    renderComposer({ onOpenReference });

    await user.type(composerEditor(), '@README');
    await user.click(await screen.findByRole('option', { name: /README.md/ }));
    await user.click(screen.getByRole('button', { name: 'Open local file README.md' }));

    expect(onOpenReference).toHaveBeenCalledWith(readmeReference);
  });

  it('opens categorized reference search from the composer plus menu', async () => {
    repositoryMocks.workspaceReferences.mockResolvedValue([
      {
        kind: 'session',
        id: 'session_prior',
        label: 'Prior evidence review',
        detail: 'Session · completed · 18 messages',
        media_type: 'application/vnd.clio.session-summary+json',
        revision: '2026-09-02T12:00:00Z',
        navigation: { session_id: 'session_prior' },
      },
    ]);
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Add context' }));
    await user.click(screen.getByRole('menuitem', { name: 'Reference existing context' }));

    expect(await screen.findByText('Conversations')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Expand Conversations' }));
    expect(screen.getByText('Prior evidence review')).toBeVisible();
  });

  it('bounds reference options returned by an older unbounded server', async () => {
    repositoryMocks.workspaceReferences.mockResolvedValue(
      Array.from({ length: 125 }, (_, index) => ({
        kind: 'workspace_file' as const,
        id: `data/file-${index}.txt`,
        label: `file-${index}.txt`,
        detail: `data/file-${index}.txt (42 bytes)`,
        media_type: 'text/plain',
        revision: `stat:${index}:42`,
        navigation: { path: `data/file-${index}.txt` },
      })),
    );
    const user = userEvent.setup();
    renderComposer();

    await user.type(composerEditor(), '@');

    await user.click(await screen.findByRole('button', { name: 'Expand Local files' }));
    await screen.findByText('file-0.txt');
    expect(screen.getAllByRole('option')).toHaveLength(100);
    expect(screen.queryByText('file-124.txt')).not.toBeInTheDocument();
  });

  it('allows a structured reference to steer without text', async () => {
    repositoryMocks.workspaceReferences.mockResolvedValue([
      {
        kind: 'workspace_file',
        id: 'data/observations.csv',
        label: 'observations.csv',
        detail: 'data/observations.csv (42 bytes)',
        media_type: 'text/csv',
        revision: 'stat:1:42',
        navigation: { path: 'data/observations.csv' },
      },
    ]);
    const user = userEvent.setup();
    const { onSubmit } = renderComposer({ state: 'running' });

    await user.type(composerEditor(), '@observations');
    await user.click(await screen.findByRole('option', { name: /observations.csv/ }));
    const steer = screen.getByRole('button', { name: 'Steer current work' });
    expect(steer).toBeEnabled();
    await user.click(steer);

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          delivery: 'steer',
          references: [
            {
              type: 'context_ref',
              ref_kind: 'workspace_file',
              ref_id: 'data/observations.csv',
              label: 'observations.csv',
              revision: 'stat:1:42',
            },
          ],
          text: '',
        }),
      ),
    );
  });
});
