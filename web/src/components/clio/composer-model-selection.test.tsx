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
  configuredEffort,
  effort,
  modelOptions,
  onSubmit,
  provider = 'codex',
  model = 'gpt-5.6-luna',
}: {
  configuredEffort?: string;
  effort?: string;
  modelOptions: ClioComposerProps['modelOptions'];
  onSubmit: ClioComposerProps['onSubmit'];
  provider?: string;
  model?: string;
}) {
  const queryClient = new QueryClient();
  const build = (next: { effort?: string; model?: string; provider?: string }) => (
    <QueryClientProvider client={queryClient}>
      <PromptInputProvider>
        <ClioComposer
          attachments={false}
          configuredEffort={configuredEffort}
          effort={next.effort}
          model={next.model ?? model}
          modelOptions={modelOptions}
          onSubmit={onSubmit}
          provider={next.provider ?? provider}
          state="completed"
        />
      </PromptInputProvider>
    </QueryClientProvider>
  );
  const view = render(build({ effort }));
  // Same element identity, new props: the no-remount path workspace-page uses.
  return {
    rerenderWith: (next: { effort?: string; model?: string; provider?: string }) =>
      view.rerender(build({ effort, ...next })),
  };
}

describe('ClioComposer model selection', () => {
  it('labels the model pill with the provider name the catalog reports', () => {
    renderComposer({
      modelOptions: [
        { ...reasoningModel, providerId: 'argonne_metis', providerName: 'ALCF Metis' },
      ],
      onSubmit: vi.fn(async () => undefined),
      provider: 'argonne_metis',
    });

    const pill = screen.getByRole('button', { name: 'Change model' });
    expect(pill).toHaveTextContent('ALCF Metis / gpt-5.6-luna');
    expect(pill).not.toHaveTextContent(/argonne/iu);
  });

  it('shows the model default but sends no level when none was picked', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<ClioComposerProps['onSubmit']>(async () => undefined);
    renderComposer({ effort: '', modelOptions: [reasoningModel], onSubmit });

    expect(
      screen.getByRole('button', { name: 'Reasoning effort: Model default (High)' }),
    ).toBeVisible();
    await user.type(composerEditor(), 'Think it through.{Enter}');

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    // The service applies the configured level; the client never sends a default.
    expect(onSubmit.mock.calls[0]?.[0].behavior.reasoning_effort).toBeUndefined();
  });

  it("sends a pick equal to the model default as the person's choice", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => undefined);
    renderComposer({ effort: '', modelOptions: [reasoningModel], onSubmit });

    await user.click(screen.getByRole('button', { name: /^Reasoning effort:/u }));
    await user.click(screen.getByRole('menuitemradio', { name: 'high' }));
    await user.type(composerEditor(), 'Same as default, but chosen.{Enter}');

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          behavior: expect.objectContaining({ reasoning_effort: 'high' }),
        }),
      ),
    );
  });

  it('shows the configured level when nothing was picked', () => {
    renderComposer({
      configuredEffort: 'low',
      effort: '',
      modelOptions: [reasoningModel],
      onSubmit: vi.fn(async () => undefined),
    });

    expect(screen.getByRole('button', { name: 'Reasoning effort: Default (Low)' })).toBeVisible();
  });

  it('sends a chosen level only when the selected model offers it', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => undefined);
    renderComposer({ effort: '', modelOptions: [reasoningModel], onSubmit });

    await user.click(screen.getByRole('button', { name: /^Reasoning effort:/u }));
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

  it('offers and sends every level a Claude model reports, max included', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => undefined);
    renderComposer({
      effort: '',
      modelOptions: [
        {
          ...reasoningModel,
          providerId: 'claude_code',
          providerName: 'Claude Code',
          id: 'claude-fable-5-1',
          label: 'claude-fable-5-1',
          reasoning: {
            levels: ['off', 'low', 'medium', 'high', 'xhigh', 'max'] as ReasoningEffort[],
            default: 'high' as ReasoningEffort,
          },
        },
      ],
      onSubmit,
      provider: 'claude_code',
      model: 'claude-fable-5-1',
    });

    await user.click(screen.getByRole('button', { name: /^Reasoning effort:/u }));
    expect(screen.getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual([
      'off',
      'low',
      'medium',
      'high',
      'Extra high',
      'max',
    ]);
    await user.click(screen.getByRole('menuitemradio', { name: 'max' }));
    await user.type(composerEditor(), 'Think as hard as you can.{Enter}');

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          behavior: expect.objectContaining({ reasoning_effort: 'max' }),
        }),
      ),
    );
  });

  it('adopts a session effort that arrives after mount as the pick; a default is only shown', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<ClioComposerProps['onSubmit']>(async () => undefined);
    const { rerenderWith } = renderComposer({
      effort: undefined,
      modelOptions: [reasoningModel],
      onSubmit,
    });

    // Nothing picked yet: the model default is displayed and NOT sent.
    expect(
      screen.getByRole('button', { name: 'Reasoning effort: Model default (High)' }),
    ).toBeVisible();
    await user.type(composerEditor(), 'Before the session loads.{Enter}');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0].behavior.reasoning_effort).toBeUndefined();

    // The session's user-sourced effort resolves after mount, without a remount.
    rerenderWith({ effort: 'low' });
    expect(await screen.findByRole('button', { name: 'Reasoning effort: low' })).toBeVisible();
    await user.type(composerEditor(), 'After the session loads.{Enter}');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1]?.[0].behavior.reasoning_effort).toBe('low');
  });

  it('never sends a pick the newly selected model does not offer', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<ClioComposerProps['onSubmit']>(async () => undefined);
    const gptOss = {
      ...reasoningModel,
      providerId: 'argonne_metis',
      providerName: 'ALCF Metis',
      id: 'gpt-oss-120b',
      label: 'gpt-oss-120b',
      reasoning: {
        levels: ['low', 'medium', 'high'] as ReasoningEffort[],
        default: 'medium' as ReasoningEffort,
      },
    };
    const { rerenderWith } = renderComposer({
      effort: 'xhigh',
      modelOptions: [reasoningModel, gptOss],
      onSubmit,
    });
    expect(screen.getByRole('button', { name: 'Reasoning effort: Extra high' })).toBeVisible();

    rerenderWith({ model: 'gpt-oss-120b', provider: 'argonne_metis' });

    expect(
      await screen.findByRole('button', { name: 'Reasoning effort: Model default (Medium)' }),
    ).toBeVisible();
    await user.type(composerEditor(), 'On the new model.{Enter}');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0].behavior.reasoning_effort).toBeUndefined();
  });

  it('does not turn a cleared session effort into a sent fallback level', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<ClioComposerProps['onSubmit']>(async () => undefined);
    const { rerenderWith } = renderComposer({
      effort: 'low',
      modelOptions: [reasoningModel],
      onSubmit,
    });

    // The authoritative session effort goes away (e.g. a session without one).
    rerenderWith({ effort: undefined });

    expect(
      await screen.findByRole('button', { name: 'Reasoning effort: Model default (High)' }),
    ).toBeVisible();
    await user.type(composerEditor(), 'No pick now.{Enter}');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0].behavior.reasoning_effort).toBeUndefined();
  });

  it('keeps a pick made before the session effort loads', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<ClioComposerProps['onSubmit']>(async () => undefined);
    const { rerenderWith } = renderComposer({
      effort: undefined,
      modelOptions: [reasoningModel],
      onSubmit,
    });

    await user.click(screen.getByRole('button', { name: /^Reasoning effort:/u }));
    await user.click(screen.getByRole('menuitemradio', { name: 'medium' }));
    // The session's stored effort arrives only now.
    rerenderWith({ effort: 'low' });

    expect(await screen.findByRole('button', { name: 'Reasoning effort: medium' })).toBeVisible();
    await user.type(composerEditor(), 'Keep my pick.{Enter}');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0].behavior.reasoning_effort).toBe('medium');
  });

  it("labels CLIO's shipped default honestly in the composer", () => {
    renderComposer({
      effort: undefined,
      modelOptions: [
        {
          ...reasoningModel,
          reasoning: {
            levels: ['off', 'low', 'medium', 'high'] as ReasoningEffort[],
            default: 'low' as ReasoningEffort,
            defaultIsShipped: true,
          },
        },
      ],
      onSubmit: vi.fn(async () => undefined),
    });

    expect(screen.getByRole('button', { name: 'Reasoning effort: Default (Low)' })).toBeVisible();
  });
});
