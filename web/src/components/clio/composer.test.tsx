import type { CommandDefinition, WorkspaceResource } from '@clio/core/v3';
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
  onPrepareFiles,
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
  onPrepareFiles?: ClioComposerProps['onPrepareFiles'];
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
          onPrepareFiles={onPrepareFiles}
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
      screen.getByRole('status', { name: 'Conversion status: Waiting for upload' }),
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

  it('uploads a selected file before submission so conversion can start immediately', async () => {
    const user = userEvent.setup();
    const uploaded: WorkspaceResource = {
      id: 'resource_pdf',
      workspace_id: 'workspace_1',
      client_upload_id: 'browser-pdf',
      revision: 1,
      name: 'paper.pdf',
      claimed_mime: 'application/pdf',
      detected_mime: 'application/pdf',
      detection_source: 'magic',
      declared_size: 12,
      received_size: 12,
      sha256: 'abc',
      state: 'ready',
      failure: '',
      created_at: '2026-09-02T00:00:00Z',
      updated_at: '2026-09-02T00:00:00Z',
      completed_at: '2026-09-02T00:00:00Z',
      mime_mismatch: false,
      processing: {
        workspace_id: 'workspace_1',
        resource_id: 'resource_pdf',
        resource_revision: 1,
        source_sha256: 'abc',
        processor: 'docling',
        processor_url: 'http://processor.test',
        job_id: 'remote_job',
        state: 'submitted',
        progress: 0,
        failure: {},
        cancellation: {},
        created_at: '2026-09-02T00:00:00Z',
        updated_at: '2026-09-02T00:00:00Z',
      },
    };
    const onPrepareFiles = vi.fn<NonNullable<ClioComposerProps['onPrepareFiles']>>(
      async (_files, onProgress) => {
        onProgress?.({ filename: 'paper.pdf', loaded: 12, total: 12 });
        return {
          parts: [
            {
              type: 'resource_ref',
              resource_id: uploaded.id,
              resource_revision: '1',
              name: uploaded.name,
            },
          ],
          resources: [uploaded],
        };
      },
    );
    const onSubmit = vi.fn<ClioComposerProps['onSubmit']>(async () => undefined);
    renderComposer({
      attachments: true,
      onPrepareFiles,
      onSubmit,
      workspaceId: 'workspace_1',
    });

    await user.upload(
      screen.getByLabelText('Upload files'),
      new File(['%PDF-content'], 'paper.pdf', { type: 'application/pdf' }),
    );

    await waitFor(() => expect(onPrepareFiles).toHaveBeenCalledOnce());
    expect(onSubmit).not.toHaveBeenCalled();
    const attachment = screen.getByRole('button', { name: 'Open paper.pdf' });
    await user.hover(attachment);
    expect(await screen.findByRole('status', { name: 'Upload status: Complete' })).toBeVisible();
    expect(screen.getByRole('status', { name: 'Conversion status: Queued' })).toBeVisible();
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
    expect(input).toHaveTextContent('Describe the image.');

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
    expect(input).toHaveAttribute('aria-disabled', 'true');
    expect(input).not.toHaveFocus();

    await act(async () => {
      resolveSubmit();
      await Promise.resolve();
    });
    view.rerender(<ClioComposer {...props} disabled={false} />);

    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveTextContent('');
  });

  it('discovers sourced commands and dispatches the canonical command with arguments', async () => {
    const user = userEvent.setup();
    const { onCommand, onSubmit } = renderComposer();
    const input = screen.getByRole('textbox');

    await user.type(input, '/rev');
    await user.click(screen.getByText('Review evidence'));
    expect(document.querySelector('input[name="message"]')).toHaveValue('/review ');

    await user.type(input, 'results/stations.csv{Enter}');

    expect(onCommand).toHaveBeenCalledWith({
      commandId: '/review',
      input: 'results/stations.csv',
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input).toHaveTextContent('');
  });

  it('does not turn unknown slash commands into chat messages', async () => {
    const user = userEvent.setup();
    const { onCommand, onSubmit } = renderComposer();
    const input = screen.getByRole('textbox');

    await user.type(input, '/not-a-service-command{Enter}');

    expect(onCommand).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input).toHaveTextContent('/not-a-service-command');
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
    expect(input).toHaveTextContent('/review results/stations.csv');
  });

  it('explains unavailable service commands without dispatching them', async () => {
    const user = userEvent.setup();
    const { onCommand } = renderComposer();
    const input = screen.getByRole('textbox');

    await user.type(input, '/admin');
    expect(screen.getByText('Requires administrator access.')).toBeVisible();
    await user.keyboard('{Enter}');

    expect(onCommand).not.toHaveBeenCalled();
    expect(input).toHaveTextContent('/admin');
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
