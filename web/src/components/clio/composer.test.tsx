import type { CommandDefinition, MessageBehavior } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { PromptInputProvider } from '@/components/ai-elements/prompt-input';
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
  vi.mocked(toast.error).mockClear();
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

const commands: CommandDefinition[] = [
  {
    id: '/review',
    title: 'Review evidence',
    description: 'Review an artifact with the configured evidence agent.',
    source: 'clio-agent',
    status: 'ready',
    enabled: true,
    aliases: ['/rev'],
    user_invocable: true,
    agent_invocable: false,
    argument_hint: '<artifact path>',
    arguments: [],
    metadata: {},
  },
  {
    id: '/admin',
    title: 'Admin operation',
    source: 'clio-agent',
    status: 'disabled',
    enabled: false,
    disabled_reason: 'Requires administrator access.',
    aliases: [],
    arguments: [],
    metadata: {},
  },
];

/** Overridable per-render selection, reapplied by `rerenderWith` below. */
interface ComposerSelection {
  confirmationPolicy?: MessageBehavior['confirmation_policy'];
  effort?: string;
  executionMode?: MessageBehavior['execution_mode'];
  model?: string;
  provider?: string;
}

function renderComposer({
  attachments = false,
  contextReferences = false,
  modelOptions,
  onBehaviorChange,
  onCommand = vi.fn(async () => undefined),
  onOpenReference,
  onPrepareFiles,
  onStop = vi.fn(),
  onSubmit = vi.fn(async () => undefined),
  state = 'completed',
  workspaceId,
  ...initialSelection
}: ComposerSelection & {
  attachments?: boolean;
  contextReferences?: boolean;
  modelOptions?: ClioComposerProps['modelOptions'];
  onBehaviorChange?: ClioComposerProps['onBehaviorChange'];
  onCommand?: (value: { commandId: string; input: string }) => Promise<void>;
  onOpenReference?: ClioComposerProps['onOpenReference'];
  onPrepareFiles?: ClioComposerProps['onPrepareFiles'];
  onStop?: () => void;
  onSubmit?: ClioComposerProps['onSubmit'];
  state?: 'completed' | 'running';
  workspaceId?: string;
} = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Closes over every non-selection prop so `rerenderWith` re-renders the
  // SAME element identity with only the selection changed -- exactly what
  // workspace-page.tsx's fixed (session-only) composer key now does, instead
  // of a fresh `render()` that would prove nothing about remount behavior.
  const build = (selection: ComposerSelection = initialSelection) => (
    <QueryClientProvider client={queryClient}>
      <PromptInputProvider>
        <ClioComposer
          attachments={attachments}
          commands={commands}
          confirmationPolicy={selection.confirmationPolicy}
          contextReferences={contextReferences}
          effort={selection.effort ?? 'medium'}
          executionMode={selection.executionMode}
          model={selection.model ?? 'gpt-5.6-luna'}
          modelOptions={modelOptions}
          onBehaviorChange={onBehaviorChange}
          onCommand={onCommand}
          onOpenReference={onOpenReference}
          onPrepareFiles={onPrepareFiles}
          onStop={onStop}
          onSubmit={onSubmit}
          provider={selection.provider ?? 'codex'}
          state={state}
          workspaceId={workspaceId}
        />
      </PromptInputProvider>
    </QueryClientProvider>
  );
  const view = render(build());
  return {
    onCommand,
    onStop,
    onSubmit,
    rerenderWith: (selection: ComposerSelection) =>
      view.rerender(build({ ...initialSelection, ...selection })),
  };
}

describe('ClioComposer authoritative behavior', () => {
  it('persists a selected Plan mode before the message is submitted', async () => {
    const user = userEvent.setup();
    const onBehaviorChange = vi.fn(async () => undefined);
    renderComposer({ confirmationPolicy: 'ask', executionMode: 'execute', onBehaviorChange });

    await user.click(screen.getByRole('button', { name: 'Execution mode: Execute' }));
    await user.click(screen.getByRole('menuitemradio', { name: /PlanDevelop/ }));

    await waitFor(() =>
      expect(onBehaviorChange).toHaveBeenCalledWith(
        expect.objectContaining({ confirmation_policy: 'ask', execution_mode: 'plan' }),
      ),
    );
    expect(screen.getByRole('button', { name: 'Execution mode: Plan' })).toBeVisible();
  });

  it('tracks mode and confirmation changes after plan approval', async () => {
    const { rerenderWith } = renderComposer({ confirmationPolicy: 'ask', executionMode: 'plan' });
    expect(screen.getByRole('button', { name: 'Execution mode: Plan' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirmation policy: Ask first' })).toBeVisible();

    rerenderWith({ confirmationPolicy: 'auto-edits', executionMode: 'execute' });
    expect(await screen.findByRole('button', { name: 'Execution mode: Execute' })).toBeVisible();
    expect(
      await screen.findByRole('button', { name: 'Confirmation policy: Workspace edits' }),
    ).toBeVisible();
  });

  // Regression: provider/model/effort resolving after navigation used to
  // remount this component to pick up the new default, silently dropping
  // in-progress attachments/drafts. Re-rendering with the SAME identity (no
  // key change) must adopt the new selection without losing either.
  it('reconciles a resolved provider/model/effort without remounting, preserving attachments and the draft', async () => {
    const user = userEvent.setup();
    const modelOptions = [
      {
        available: true,
        id: 'gpt-5.6-luna',
        label: 'GPT-5.6 Luna',
        providerId: 'codex',
        providerName: 'Codex',
      },
      {
        available: true,
        id: 'nova-1',
        label: 'Nova Model',
        providerId: 'anthropic',
        providerName: 'Anthropic',
      },
    ];
    const { rerenderWith } = renderComposer({ attachments: true, modelOptions });

    await user.upload(
      screen.getByLabelText('Upload files'),
      new File(['notes'], 'field-notes.md', { type: 'text/markdown' }),
    );
    await user.type(composerEditor(), 'Draft that must survive.');
    expect(screen.getByRole('button', { name: 'Open field-notes.md' })).toBeVisible();
    expect(document.querySelector('input[name="message"]')).toHaveValue('Draft that must survive.');

    // The active provider/model/effort resolving shortly after mount.
    rerenderWith({ effort: 'high', model: 'nova-1', provider: 'anthropic' });

    // The trigger's a11y name is the fixed "Change model", not the
    // selection, so assert on its text. Fails pre-fix: `useState(provider)`
    // only reads its initial value once and never adopts a later prop
    // change without a remount.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Change model' })).toHaveTextContent('Nova Model'),
    );
    expect(screen.getByRole('button', { name: 'Open field-notes.md' })).toBeVisible();
    expect(document.querySelector('input[name="message"]')).toHaveValue('Draft that must survive.');
  });
});

