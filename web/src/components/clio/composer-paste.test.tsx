import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PromptInputProvider } from '@/components/ai-elements/prompt-input';
import { AppearanceProvider } from '@/providers/appearance-provider';
import { ClioComposer, type ClioComposerProps } from './composer';

vi.mock('@/hooks/use-repository', () => ({
  useRepository: () => ({ workspaceReferences: async () => [] }),
}));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://clio.test' } }),
}));

beforeEach(() => localStorage.clear());
afterEach(cleanup);

function renderComposer(props: Partial<ClioComposerProps> = {}, threshold = 4000) {
  localStorage.setItem('clio.appearance.v1', JSON.stringify({ pasteSourceThreshold: threshold }));
  const submit = vi.fn<ClioComposerProps['onSubmit']>(async () => undefined);
  const view = render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AppearanceProvider>
        <PromptInputProvider>
          <ClioComposer
            attachments
            state="completed"
            provider="codex"
            model="gpt-5.6-luna"
            onSubmit={submit}
            {...props}
          />
        </PromptInputProvider>
      </AppearanceProvider>
    </QueryClientProvider>,
  );
  return {
    ...view,
    submit,
    editor: screen.getByRole('combobox', { name: /Ask .* to investigate/ }),
  };
}

function paste(editor: HTMLElement, text: string) {
  fireEvent.paste(editor, {
    clipboardData: {
      files: [],
      items: [],
      getData: (type: string) => (type === 'text/plain' ? text : ''),
    },
  });
}

it('turns a threshold-sized paste into an immediately prepared, clickable file without changing the draft', async () => {
  const user = userEvent.setup();
  const prepare = vi.fn<NonNullable<ClioComposerProps['onPrepareFiles']>>(async () => ({
    parts: [],
    resources: [],
  }));
  const { editor, submit } = renderComposer({ onPrepareFiles: prepare });
  await user.type(editor, 'Review this: ');
  const text = '  configuration:\r\n  value: "λ🌊"\r\n'.padEnd(4000, ' ');
  paste(editor, text);
  const pill = await screen.findByRole('button', { name: /^Open Pasted text .*\.txt$/ });
  expect(editor).toHaveTextContent('Review this:');
  expect(editor).not.toHaveTextContent('configuration:');
  await waitFor(() => expect(prepare).toHaveBeenCalledOnce());
  const file = prepare.mock.calls[0]![0]![0];
  expect(file.mediaType).toBe('text/plain');
  expect(await file.file!.text()).toBe(text);
  await user.click(pill);
  await waitFor(() =>
    expect(screen.getByRole('dialog').querySelector('pre')?.textContent).toBe(text),
  );
  await user.click(screen.getByRole('button', { name: 'Close' }));
  await user.click(screen.getByRole('button', { name: 'Submit' }));
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  expect(submit.mock.calls[0]![0]).toMatchObject({
    text: 'Review this:',
    files: [{ filename: file.filename }],
  });
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: /^Open Pasted text/ })).toBeNull(),
  );
});

it.each([
  { threshold: 4000, length: 3999, attachments: true },
  { threshold: 0, length: 5000, attachments: true },
  { threshold: 4000, length: 5000, attachments: false },
])(
  'keeps text inline for $threshold/$length characters with attachments=$attachments',
  async ({ threshold, length, attachments }) => {
    const { editor } = renderComposer({ attachments }, threshold);
    await userEvent.setup().click(editor);
    const text = 'x'.repeat(length);
    paste(editor, text);
    expect(document.querySelector('input[name="message"]')).toHaveValue(text);
    expect(screen.queryByRole('group', { name: 'Pending attachments' })).toBeNull();
  },
);

it('uses the configured threshold immediately and gives repeated pastes distinct source names', async () => {
  const { editor } = renderComposer({}, 10);
  paste(editor, 'first text');
  paste(editor, 'other text');
  const pills = await screen.findAllByRole('button', { name: /^Open Pasted text/ });
  expect(pills).toHaveLength(2);
  expect(pills[0]!.getAttribute('aria-label')).not.toBe(pills[1]!.getAttribute('aria-label'));
});

it('keeps the exact file through failed sending, then permits retry', async () => {
  const send = vi
    .fn<ClioComposerProps['onSubmit']>()
    .mockRejectedValueOnce(new Error('Upload unavailable'))
    .mockResolvedValueOnce(undefined);
  const { editor } = renderComposer({ onSubmit: send }, 10);
  const text = 'complete source\r\nwith whitespace  ';
  paste(editor, text);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Submit' }));
  await waitFor(() => expect(send).toHaveBeenCalledOnce());
  expect(await screen.findByRole('button', { name: /^Open Pasted text/ })).toBeVisible();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Submit' }));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  expect(send.mock.calls[1]![0].files[0]!.file).toBe(send.mock.calls[0]![0].files[0]!.file);
  expect(await send.mock.calls[1]![0].files[0]!.file!.text()).toBe(text);
});

it('discards an unsent pasted source when its pill is removed', async () => {
  const discard = vi.fn(async () => undefined);
  const { editor } = renderComposer({ onDiscardFiles: discard }, 10);
  paste(editor, 'discard this text');
  await userEvent.setup().click(screen.getByRole('button', { name: /^Remove Pasted text/ }));
  await waitFor(() => expect(discard).toHaveBeenCalledOnce());
  expect(screen.queryByRole('button', { name: /^Open Pasted text/ })).toBeNull();
  expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
});

it('does not accept a paste while disabled', () => {
  const { editor } = renderComposer({ disabled: true }, 10);
  paste(editor, 'do not accept');
  expect(screen.queryByRole('group', { name: 'Pending attachments' })).toBeNull();
});
