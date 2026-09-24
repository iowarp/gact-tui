import type { ReasoningEffort } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptInputProvider } from '@/components/ai-elements/prompt-input';
import { ClioComposer, type ClioComposerProps } from './composer';

const repositoryMocks = vi.hoisted(() => ({ workspaceReferences: vi.fn() }));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repositoryMocks }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://clio.test' } }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

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

/** A model whose provider reports four thinking levels and names its default. */
const reasoningModel = {
  providerId: 'codex',
  providerName: 'OpenAI Codex',
  id: 'gpt-5.6-luna',
  label: 'gpt-5.6-luna',
  available: true,
  reasoning: {
    levels: ['low', 'medium', 'high', 'xhigh'] as ReasoningEffort[],
    default: 'high' as ReasoningEffort,
  },
};

function composerEditor(): HTMLElement {
  return screen.getByRole('combobox', { name: /investigate, build, explain, or act/ });
}

function renderComposer({
  effort,
  modelOptions,
  onSubmit,
}: {
  effort?: string;
  modelOptions: ClioComposerProps['modelOptions'];
  onSubmit: ClioComposerProps['onSubmit'];
}) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PromptInputProvider>
        <ClioComposer
          attachments={false}
          effort={effort}
          model="gpt-5.6-luna"
          modelOptions={modelOptions}
          onSubmit={onSubmit}
          provider="codex"
          state="completed"
        />
      </PromptInputProvider>
    </QueryClientProvider>,
  );
}

describe('ClioComposer reasoning levels come from the selected model', () => {
  it('sends the default level of the selected model when none was chosen', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => undefined);
    renderComposer({ effort: '', modelOptions: [reasoningModel], onSubmit });

    expect(screen.getByRole('button', { name: 'Reasoning effort: high' })).toBeVisible();
    await user.type(composerEditor(), 'Think it through.{Enter}');

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          behavior: expect.objectContaining({ reasoning_effort: 'high' }),
        }),
      ),
    );
  });

  it('sends a chosen level only when the selected model offers it', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => undefined);
    renderComposer({ effort: '', modelOptions: [reasoningModel], onSubmit });

    await user.click(screen.getByRole('button', { name: 'Reasoning effort: high' }));
    expect(screen.getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual([
      'low',
      'medium',
      'high',
      'Extra high',
    ]);
    await user.click(screen.getByRole('menuitemradio', { name: 'Extra high' }));
    await user.type(composerEditor(), 'Go deep.{Enter}');

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          behavior: expect.objectContaining({ reasoning_effort: 'xhigh' }),
        }),
      ),
    );
  });

  it('hides reasoning and sends no level for a model that offers none', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<ClioComposerProps['onSubmit']>(async () => undefined);
    renderComposer({
      modelOptions: [{ ...reasoningModel, reasoning: { levels: [] } }],
      onSubmit,
    });

    expect(screen.queryByRole('button', { name: /^Reasoning effort:/ })).not.toBeInTheDocument();
    await user.type(composerEditor(), 'Plain answer.{Enter}');

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0].behavior.reasoning_effort).toBeUndefined();
  });
  it('names an effort the service reported that this build has no setting for', () => {
    renderComposer({
      onSubmit: vi.fn(async () => undefined),
      effort: 'ultra',
      modelOptions: [
        {
          providerId: 'codex',
          providerName: 'OpenAI Codex',
          id: 'gpt-5.6-luna',
          label: 'gpt-5.6-luna',
          available: true,
          reasoning: { levels: ['low', 'medium', 'high'] },
        },
      ],
    });

    const control = screen.getByRole('button', { name: /^Reasoning effort:/ });
    expect(control).toHaveAccessibleName('Reasoning effort: Unknown (ultra)');
    expect(control).not.toHaveTextContent('medium');
  });
});
