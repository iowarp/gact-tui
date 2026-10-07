import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import {
  PromptInput,
  PromptInputProvider,
  PromptInputTextarea,
  usePromptInputController,
} from './prompt-input';

afterEach(cleanup);

function Draft({ send, showForm = true }: { send: () => Promise<void>; showForm?: boolean }) {
  const controller = usePromptInputController();
  return (
    <>
      <ul>
        {controller.attachments.files.map((file) => (
          <li key={file.id}>{file.filename}</li>
        ))}
      </ul>
      {showForm ? (
        <PromptInput
          multiple
          onSubmit={async () => {
            await send();
            // ClioComposer clears controlled text before PromptInput receives success.
            controller.textInput.clear();
          }}
        >
          <PromptInputTextarea aria-label="Message" />
          <button type="submit">Send</button>
        </PromptInput>
      ) : null}
    </>
  );
}

it('clears sent attachments despite cleared text, retaining later attachments and failed sends', async () => {
  const user = userEvent.setup();
  let finish: () => void = () => undefined;
  const send = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(
    <PromptInputProvider initialInput="Look at this">
      <Draft send={send} />
    </PromptInputProvider>,
  );
  const upload = screen.getByLabelText('Upload files');
  await user.upload(upload, new File(['sent'], 'sent.png', { type: 'image/png' }));
  await user.click(screen.getByRole('button', { name: 'Send' }));
  expect(send).toHaveBeenCalledOnce();
  await user.upload(upload, new File(['next'], 'next.png', { type: 'image/png' }));
  await act(async () => finish());
  await waitFor(() => expect(screen.queryByText('sent.png')).not.toBeInTheDocument());
  expect(screen.getByText('next.png')).toBeVisible();
  expect(screen.getByLabelText('Message')).toHaveValue('');

  send.mockImplementationOnce(async () => {
    throw new Error('Send refused');
  });
  await user.type(screen.getByLabelText('Message'), 'Retry this');
  await user.click(screen.getByRole('button', { name: 'Send' }));
  expect(screen.getByText('next.png')).toBeVisible();
  expect(screen.getByLabelText('Message')).toHaveValue('Retry this');
  await user.click(screen.getByRole('button', { name: 'Send' }));
  view.rerender(
    <PromptInputProvider initialInput="Look at this">
      <Draft send={send} showForm={false} />
    </PromptInputProvider>,
  );
  await act(async () => finish());
  await waitFor(() => expect(screen.queryByText('next.png')).not.toBeInTheDocument());
});
