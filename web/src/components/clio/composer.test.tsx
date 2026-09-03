import type { CommandDefinition } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
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

function renderComposer({
  attachments = false,
  contextReferences = false,
  effort = 'medium',
  onCommand = vi.fn(async () => undefined),
  onOpenReference,
  onStop = vi.fn(),
  onSubmit = vi.fn(async () => undefined),
  state = 'completed',
  workspaceId,
}: {
  attachments?: boolean;
  contextReferences?: boolean;
  effort?: string;
  onCommand?: (value: { commandId: string; input: string }) => Promise<void>;
  onOpenReference?: ClioComposerProps['onOpenReference'];
  onStop?: () => void;
  onSubmit?: ClioComposerProps['onSubmit'];
  state?: 'completed' | 'running';
  workspaceId?: string;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <PromptInputProvider>
        <ClioComposer
          attachments={attachments}
          commands={commands}
          contextReferences={contextReferences}
          effort={effort}
          model="gpt-5.6-luna"
          onCommand={onCommand}
          onOpenReference={onOpenReference}
          onStop={onStop}
          onSubmit={onSubmit}
          provider="codex"
          state={state}
          workspaceId={workspaceId}
        />
      </PromptInputProvider>
    </QueryClientProvider>,
  );
  return { onCommand, onStop, onSubmit };
}

describe('ClioComposer service commands', () => {
  it('turns an @ selection into a structured reference and keeps it out of text', async () => {
    repositoryMocks.workspaceReferences.mockResolvedValue([
      {
        kind: 'artifact',
        id: 'artifact_plot',
        label: 'Displacement plot',
        detail: 'Displacement plot v3 (image)',
        media_type: 'image/png',
        revision: 'v3',
        navigation: { artifact_id: 'artifact_plot' },
      },
    ]);
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => undefined);
    renderComposer({ contextReferences: true, onSubmit, workspaceId: 'workspace_1' });
    const input = screen.getByRole('textbox');

    await user.type(input, '@plot');
    await user.click(await screen.findByRole('option', { name: /Displacement plot/ }));

    expect(screen.getByRole('listitem')).toHaveTextContent('Displacement plot');
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

  it('uses arrow keys and Enter to select a reference instead of submitting literal @ text', async () => {
    repositoryMocks.workspaceReferences.mockResolvedValue([
      {
        kind: 'workspace_file',
        id: 'README.md',
        label: 'README.md',
        detail: 'README.md (400 bytes)',
        media_type: 'text/markdown',
        revision: 'stat:1:400',
        navigation: { path: 'README.md' },
      },
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
    const onSubmit = vi.fn(async () => undefined);
    renderComposer({ contextReferences: true, onSubmit, workspaceId: 'workspace_1' });
    const input = screen.getByRole('textbox');

    await user.type(input, '@');
    await screen.findByRole('option', { name: /README.md/ });
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
    expect(input).not.toHaveValue('@');
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

  it('opens a selected reference from its typed token', async () => {
    const reference = {
      kind: 'workspace_file' as const,
      id: 'README.md',
      label: 'README.md',
      detail: 'README.md (400 bytes)',
      media_type: 'text/markdown',
      revision: 'stat:1:400',
      navigation: { path: 'README.md' },
    };
    repositoryMocks.workspaceReferences.mockResolvedValue([reference]);
    const user = userEvent.setup();
    const onOpenReference = vi.fn();
    renderComposer({
      contextReferences: true,
      onOpenReference,
      workspaceId: 'workspace_1',
    });

    await user.type(screen.getByRole('textbox'), '@README');
    await user.click(await screen.findByRole('option', { name: /README.md/ }));
    await user.click(screen.getByRole('button', { name: 'Open local file README.md' }));

    expect(onOpenReference).toHaveBeenCalledWith(reference);
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
    renderComposer({ contextReferences: true, workspaceId: 'workspace_1' });

    await user.click(screen.getByRole('button', { name: 'Add context' }));
    await user.click(screen.getByText('Reference existing context'));

    expect(await screen.findByText('Conversations')).toBeVisible();
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
    renderComposer({ contextReferences: true, workspaceId: 'workspace_1' });

    await user.type(screen.getByRole('textbox'), '@');

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
    const onSubmit = vi.fn(async () => undefined);
    renderComposer({
      contextReferences: true,
      onSubmit,
      state: 'running',
      workspaceId: 'workspace_1',
    });

    await user.type(screen.getByRole('textbox'), '@observations');
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

  it('adds and submits every file selected in one picker interaction', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => undefined);
    renderComposer({ attachments: true, onSubmit });

    const files = [
      new File(['# First'], 'first.md', { type: 'text/markdown' }),
      new File(['print("second")'], 'second.py', { type: 'text/x-python' }),
    ];
    const picker = screen.getByLabelText('Upload files');

    expect(picker).toHaveAttribute('multiple');
    await user.upload(picker, files);

    expect(screen.getByRole('button', { name: 'Open first.md' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open second.py' })).toBeVisible();

    await user.type(screen.getByRole('textbox'), 'Inspect both files.{Enter}');

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          files: [
            expect.objectContaining({ filename: 'first.md', mediaType: 'text/markdown' }),
            expect.objectContaining({ filename: 'second.py', mediaType: 'text/x-python' }),
          ],
          text: 'Inspect both files.',
        }),
      ),
    );
  });

  it('opens the AI Elements attachment picker from a direct composer action', async () => {
    const user = userEvent.setup();
    renderComposer({ attachments: true });
    const picker = screen.getByLabelText('Upload files');
    const open = vi.spyOn(picker, 'click');

    await user.click(screen.getByRole('button', { name: 'Add files' }));
    expect(open).toHaveBeenCalledOnce();
  });

  it('renders an image thumbnail and opens the full attachment preview', async () => {
    const user = userEvent.setup();
    renderComposer({ attachments: true });
    const picker = screen.getByLabelText('Upload files');
    const image = new File(['pixels'], 'field-map.png', { type: 'image/png' });

    await user.upload(picker, image);

    const thumbnail = screen.getByRole('img', { name: 'field-map.png' });
    expect(thumbnail).toBeVisible();
    expect(thumbnail).toHaveAttribute('src', 'blob:test-field-map.png');

    const openAttachment = screen.getByRole('button', { name: 'Open field-map.png' });
    expect(
      within(openAttachment).getByRole('img', { name: 'Attachment status: Waiting' }),
    ).toBeVisible();
    await user.hover(openAttachment);
    expect(
      await screen.findByRole('status', { name: 'Upload status: Ready locally' }),
    ).toBeVisible();
    expect(
      screen.getByRole('status', { name: 'Conversion status: Starts after submission' }),
    ).toBeVisible();

    await user.click(openAttachment);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeVisible();
    expect(screen.getByRole('heading', { name: 'field-map.png' })).toBeVisible();
    expect(within(dialog).getByRole('img', { name: 'field-map.png' })).toHaveAttribute(
      'src',
      'blob:test-field-map.png',
    );
  });

  it('keeps a rejected attachment retryable without a stale uploading state', async () => {
    const user = userEvent.setup();
    let attempt = 0;
    const onSubmit = vi.fn<ClioComposerProps['onSubmit']>(async (value) => {
      value.onUploadProgress({ filename: 'field-map.png', loaded: 6, total: 6 });
      attempt += 1;
      if (attempt === 1) {
        throw new Error('The selected model cannot receive this image resource.');
      }
    });
    renderComposer({ attachments: true, onSubmit });
    await user.upload(
      screen.getByLabelText('Upload files'),
      new File(['pixels'], 'field-map.png', { type: 'image/png' }),
    );
    const input = screen.getByRole('textbox');

    await user.type(input, 'Describe the image.{Enter}');

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Uploading field-map.png 100%')).not.toBeInTheDocument();
    const attachment = screen.getByRole('button', { name: 'Open field-map.png' });
    expect(attachment).toBeVisible();
    // A rejected upload must not keep reading as a healthy local attachment.
    expect(
      within(attachment).getByRole('img', { name: 'Attachment status: Unavailable' }),
    ).toBeVisible();
    await user.hover(attachment);
    expect(await screen.findByRole('status', { name: 'Upload status: Failed' })).toBeVisible();
    expect(
      screen.getByText('The selected model cannot receive this image resource.'),
    ).toBeVisible();
    expect(input).toHaveValue('Describe the image.');

    await user.click(screen.getByRole('button', { name: /^Submit$/ }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Uploading field-map.png 100%')).not.toBeInTheDocument();
    // The accepted retry clears the tray, so no stale failure is left behind.
    expect(screen.queryByRole('button', { name: 'Open field-map.png' })).not.toBeInTheDocument();
  });

  it('focuses only after an explicit focus request changes', async () => {
    const props = {
      attachments: false,
      effort: 'medium',
      model: 'gpt-5.6-luna',
      onSubmit: vi.fn(async () => undefined),
      provider: 'codex',
      state: 'completed' as const,
    };
    const { rerender } = render(<ClioComposer {...props} focusRequestKey={0} />);
    const input = screen.getByRole('textbox');

    expect(input).not.toHaveFocus();

    rerender(<ClioComposer {...props} focusRequestKey={1} />);
    await waitFor(() => expect(input).toHaveFocus());
  });

  it('restores the textarea focus after the sending block clears', async () => {
    const user = userEvent.setup();
    let resolveSubmit!: () => void;
    const onSubmit = vi.fn<ClioComposerProps['onSubmit']>(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    const props = {
      attachments: false,
      effort: 'medium',
      model: 'gpt-5.6-luna',
      onSubmit,
      provider: 'codex',
      state: 'completed' as const,
    };
    const view = render(<ClioComposer {...props} />);
    const input = screen.getByRole('textbox');

    await user.type(input, 'Send this message.{Enter}');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());

    input.blur();
    view.rerender(<ClioComposer {...props} disabled />);
    expect(input).toBeDisabled();
    expect(input).not.toHaveFocus();

    await act(async () => {
      resolveSubmit();
      await Promise.resolve();
    });
    view.rerender(<ClioComposer {...props} disabled={false} />);

    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveValue('');
  });

  it('discovers sourced commands and dispatches the canonical command with arguments', async () => {
    const user = userEvent.setup();
    const { onCommand, onSubmit } = renderComposer();
    const input = screen.getByRole('textbox');

    await user.type(input, '/rev');
    await user.click(screen.getByText('Review evidence'));
    expect(input).toHaveValue('/review ');

    await user.type(input, 'results/stations.csv{Enter}');

    expect(onCommand).toHaveBeenCalledWith({
      commandId: '/review',
      input: 'results/stations.csv',
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input).toHaveValue('');
  });

  it('does not turn unknown slash commands into chat messages', async () => {
    const user = userEvent.setup();
    const { onCommand, onSubmit } = renderComposer();
    const input = screen.getByRole('textbox');

    await user.type(input, '/not-a-service-command{Enter}');

    expect(onCommand).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input).toHaveValue('/not-a-service-command');
  });

  it('reveals the inline attachment remove control to a keyboard as well as a pointer', async () => {
    const user = userEvent.setup();
    renderComposer({ attachments: true });
    await user.upload(
      screen.getByLabelText('Upload files'),
      new File(['pixels'], 'field-map.png', { type: 'image/png' }),
    );

    const remove = screen.getByRole('button', { name: 'Remove' });
    expect(remove).toHaveClass('group-hover:opacity-100', 'group-focus-within:opacity-100');
  });

  it('names an effort the service reported that this build has no setting for', () => {
    renderComposer({ effort: 'ultra' });

    const control = screen.getByRole('button', { name: /^Reasoning effort:/ });
    expect(control).toHaveAccessibleName('Reasoning effort: Unknown (ultra)');
    expect(control).not.toHaveTextContent('medium');
  });

  it('reports a rejected service command instead of swallowing it', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn().mockRejectedValue(new Error('The command service is unreachable.'));
    renderComposer({ onCommand });
    const input = screen.getByRole('textbox');

    await user.type(input, '/review results/stations.csv{Enter}');

    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Review evidence was not run', {
        description: 'The command service is unreachable.',
      }),
    );
    // A rejected command leaves the typed command in place to retry.
    expect(input).toHaveValue('/review results/stations.csv');
  });

  it('explains unavailable service commands without dispatching them', async () => {
    const user = userEvent.setup();
    const { onCommand } = renderComposer();
    const input = screen.getByRole('textbox');

    await user.type(input, '/admin');
    expect(screen.getByText('Requires administrator access.')).toBeVisible();
    await user.keyboard('{Enter}');

    expect(onCommand).not.toHaveBeenCalled();
    expect(input).toHaveValue('/admin');
  });

  it('keeps steering and stopping as distinct actions while work is running', async () => {
    const user = userEvent.setup();
    const { onStop, onSubmit } = renderComposer({ state: 'running' });
    const input = screen.getByRole('textbox');

    expect(input).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Steer current work' })).toBeDisabled();
    expect(screen.queryByText('Working')).not.toBeInTheDocument();

    await user.type(input, 'Prioritize the provenance gap.');
    await user.click(screen.getByRole('button', { name: 'Steer current work' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Prioritize the provenance gap.' }),
    );
    expect(onStop).not.toHaveBeenCalled();
  });

  it('queues Enter and steers Ctrl+Enter while work is running', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderComposer({ state: 'running' });
    const input = screen.getByRole('textbox');

    await user.type(input, 'Review the second station.{Enter}');
    await waitFor(() =>
      expect(onSubmit).toHaveBeenLastCalledWith(
        expect.objectContaining({
          delivery: 'queued',
          text: 'Review the second station.',
        }),
      ),
    );

    await user.type(input, 'Stop using the stale catalog.{Control>}{Enter}{/Control}');
    await waitFor(() =>
      expect(onSubmit).toHaveBeenLastCalledWith(
        expect.objectContaining({
          delivery: 'steer',
          text: 'Stop using the stale catalog.',
        }),
      ),
    );
  });

  it('starts normally from either Enter shortcut while idle', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderComposer();
    const input = screen.getByRole('textbox');

    await user.type(input, 'Start the analysis.{Enter}');
    await waitFor(() =>
      expect(onSubmit).toHaveBeenLastCalledWith(
        expect.objectContaining({ delivery: 'start', text: 'Start the analysis.' }),
      ),
    );

    await user.type(input, 'Start another turn.{Control>}{Enter}{/Control}');
    await waitFor(() =>
      expect(onSubmit).toHaveBeenLastCalledWith(
        expect.objectContaining({ delivery: 'start', text: 'Start another turn.' }),
      ),
    );
  });

  it('resets a queued running-turn intent when the session becomes idle', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => undefined);
    const renderState = (state: 'completed' | 'running') => (
      <PromptInputProvider>
        <ClioComposer
          attachments={false}
          effort="medium"
          model="gpt-5.6-luna"
          onSubmit={onSubmit}
          provider="codex"
          state={state}
        />
      </PromptInputProvider>
    );
    const view = render(renderState('running'));
    const input = screen.getByRole('textbox');

    await user.type(input, 'Queue this while running.{Enter}');
    await waitFor(() =>
      expect(onSubmit).toHaveBeenLastCalledWith(
        expect.objectContaining({ delivery: 'queued', text: 'Queue this while running.' }),
      ),
    );

    view.rerender(renderState('completed'));
    await user.type(screen.getByRole('textbox'), 'Start this after completion.');
    await user.click(screen.getByRole('button', { name: /^Submit$/ }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenLastCalledWith(
        expect.objectContaining({ delivery: 'start', text: 'Start this after completion.' }),
      ),
    );
  });
});
