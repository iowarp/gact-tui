/**
 * A4 — prompt editor Save flow.
 *
 *  - Expanding a prompt card loads its text (getPrompt) into an editable
 *    textarea seeded with that text.
 *  - Validate calls validatePrompt({text, scope context}) and reports the verdict.
 *  - Save calls savePrompt(id, {text, scope}) with the chosen scope
 *    (default global) and keeps the inline success result visible.
 *  - A 422/validation error from Save surfaces inline (honest message).
 *
 * Mocks the @clio/core Client as a partial fake.
 */
import { render, screen, cleanup, fireEvent, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Client, PromptDef } from '@clio/core';
import { PromptsPage } from '../../src/routes/discovery/PromptsPage.js';

afterEach(cleanup);

const PROMPT: PromptDef = {
  id: 'clio.chat',
  title: 'Chat agent',
  description: '',
  default_profile: 'default',
  scope: 'builtin',
} as unknown as PromptDef;

function makeClient(overrides: Partial<Record<keyof Client, unknown>> = {}): {
  client: Client;
  prompts: ReturnType<typeof vi.fn>;
  getPrompt: ReturnType<typeof vi.fn>;
  validatePrompt: ReturnType<typeof vi.fn>;
  savePrompt: ReturnType<typeof vi.fn>;
} {
  const prompts = vi
    .fn()
    .mockResolvedValue({ prompts: [PROMPT], sources: [] });
  const getPrompt = vi.fn().mockResolvedValue({
    prompt: { id: 'clio.chat', profile: 'default', text: 'You are CLIO.' },
  });
  const validatePrompt = vi
    .fn()
    .mockResolvedValue({ enabled: true, validation_errors: [], prompt: {} });
  const savePrompt = vi.fn().mockResolvedValue({ prompt: PROMPT });
  const reloadPrompts = vi.fn().mockResolvedValue({});
  const client = {
    prompts,
    getPrompt,
    validatePrompt,
    savePrompt,
    reloadPrompts,
    ...overrides,
  } as unknown as Client;
  return { client, prompts, getPrompt, validatePrompt, savePrompt };
}

/** Expand the prompt card and wait for the editable textarea to appear. */
async function expandAndWaitForEditor() {
  await waitFor(() => expect(screen.queryByTestId('prompt-card-clio.chat')).toBeTruthy());
  fireEvent.click(screen.getByTestId('prompt-card-clio.chat'));
  await waitFor(() => expect(screen.queryByTestId('prompt-edit-text')).toBeTruthy());
}

describe('A4 — prompt editor save', () => {
  it('seeds the textarea with the loaded prompt text', async () => {
    const { client, getPrompt } = makeClient();
    render(() => <PromptsPage client={client} />);
    await expandAndWaitForEditor();

    expect(getPrompt).toHaveBeenCalledWith('clio.chat', {});
    const ta = screen.getByTestId('prompt-edit-text') as HTMLTextAreaElement;
    await waitFor(() => expect(ta.value).toBe('You are CLIO.'));
  });

  it('Validate calls validatePrompt and reports a valid verdict', async () => {
    const { client, validatePrompt } = makeClient();
    render(() => <PromptsPage client={client} />);
    await expandAndWaitForEditor();

    fireEvent.click(screen.getByTestId('prompt-validate'));
    await waitFor(() =>
      expect(validatePrompt).toHaveBeenCalledWith('clio.chat', { text: 'You are CLIO.' }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('prompt-save-result').textContent).toMatch(/valid/i),
    );
  });

  it('Save calls savePrompt with edited text + default global scope and keeps the result visible', async () => {
    const { client, savePrompt, prompts } = makeClient();
    render(() => <PromptsPage client={client} />);
    await expandAndWaitForEditor();

    const ta = screen.getByTestId('prompt-edit-text') as HTMLTextAreaElement;
    await waitFor(() => expect(ta.value).toBe('You are CLIO.'));
    fireEvent.input(ta, { target: { value: 'You are CLIO, edited.' } });
    fireEvent.click(screen.getByTestId('prompt-save'));

    await waitFor(() =>
      expect(savePrompt).toHaveBeenCalledWith('clio.chat', {
        text: 'You are CLIO, edited.',
        scope: 'global',
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('prompt-save-result').textContent).toMatch(/saved/i),
    );
    expect(prompts).toHaveBeenCalledTimes(1);
  });

  it('honors a non-default scope selection with workspace context', async () => {
    const { client, savePrompt } = makeClient();
    render(() => <PromptsPage client={client} context={{ workspaceId: 'ws_123' }} />);
    await expandAndWaitForEditor();

    fireEvent.change(screen.getByTestId('prompt-save-scope'), {
      target: { value: 'workspace' },
    });
    fireEvent.click(screen.getByTestId('prompt-save'));
    await waitFor(() =>
      expect(savePrompt).toHaveBeenCalledWith(
        'clio.chat',
        expect.objectContaining({ scope: 'workspace', workspace_id: 'ws_123' }),
      ),
    );
  });

  it('surfaces a 422/validation error from Save inline', async () => {
    const { client } = makeClient({
      savePrompt: vi
        .fn()
        .mockRejectedValue(new Error('validation_error: builtin prompts cannot be overwritten')),
    });
    render(() => <PromptsPage client={client} />);
    await expandAndWaitForEditor();

    fireEvent.click(screen.getByTestId('prompt-save'));
    await waitFor(() =>
      expect(screen.getByTestId('prompt-save-result').textContent).toContain(
        'cannot be overwritten',
      ),
    );
  });
});
