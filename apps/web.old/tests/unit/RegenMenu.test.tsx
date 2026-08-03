/**
 * 1.0 item 4 — Regenerate variant menu (retry with notes / retry with model).
 *
 * The menu rides clio's retry route (`POST …/messages/{id}/retry`), which
 * accepts `notes` and `provider_id`/`model_id` overrides. These tests cover
 * the client-side menu behaviour: open/close, variant selection, and the
 * payload each variant hands back to the ChatScreen callbacks.
 */
import { render, screen, cleanup, fireEvent } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { Transcript } from '../../src/components/Transcript.js';
import type { Message } from '@clio/core';
import type { ModelOption } from '../../src/components/Composer.js';

afterEach(cleanup);

const ASSISTANT: Message = {
  id: 'a1',
  role: 'assistant',
  parts: [{ type: 'text', text: 'The capital of France is Paris.' }],
};

const MODELS: ModelOption[] = [
  {
    id: 'anthropic:opus',
    providerId: 'anthropic',
    modelId: 'opus',
    providerLabel: 'Anthropic',
  },
  {
    id: 'alcf:gpt-oss',
    providerId: 'alcf',
    modelId: 'gpt-oss',
    providerLabel: 'ALCF',
  },
];

describe('Regenerate variant menu (1.0 item 4)', () => {
  it('fires onRegenerate immediately when no variant callbacks are provided', () => {
    let fired = false;
    render(() => (
      <Transcript
        messages={[ASSISTANT]}
        density="normal"
        onRegenerate={() => {
          fired = true;
        }}
      />
    ));
    fireEvent.click(screen.getByTestId('msg-regen-a1'));
    expect(fired).toBe(true);
    expect(screen.queryByTestId('regen-menu-a1')).toBeNull();
  });

  it('opens the variant menu when variant callbacks are provided', () => {
    render(() => (
      <Transcript
        messages={[ASSISTANT]}
        density="normal"
        onRegenerate={() => undefined}
        onRegenerateWithNotes={() => undefined}
        onRegenerateWithModel={() => undefined}
        models={MODELS}
      />
    ));
    fireEvent.click(screen.getByTestId('msg-regen-a1'));
    expect(screen.getByTestId('regen-menu-a1')).toBeTruthy();
    expect(screen.getByTestId('regen-plain-a1')).toBeTruthy();
    expect(screen.getByTestId('regen-notes-a1')).toBeTruthy();
    expect(screen.getByTestId('regen-model-a1')).toBeTruthy();
  });

  it('plain Regenerate fires onRegenerate and closes the menu', () => {
    let fired = false;
    render(() => (
      <Transcript
        messages={[ASSISTANT]}
        density="normal"
        onRegenerate={() => {
          fired = true;
        }}
        onRegenerateWithNotes={() => undefined}
        models={MODELS}
      />
    ));
    fireEvent.click(screen.getByTestId('msg-regen-a1'));
    fireEvent.click(screen.getByTestId('regen-plain-a1'));
    expect(fired).toBe(true);
    expect(screen.queryByTestId('regen-menu-a1')).toBeNull();
  });

  it('notes flow submits the typed notes for the right message', () => {
    let got: { msg: string; notes: string } | null = null;
    render(() => (
      <Transcript
        messages={[ASSISTANT]}
        density="normal"
        onRegenerate={() => undefined}
        onRegenerateWithNotes={(m, notes) => {
          got = { msg: m.id, notes };
        }}
        models={MODELS}
      />
    ));
    fireEvent.click(screen.getByTestId('msg-regen-a1'));
    fireEvent.click(screen.getByTestId('regen-notes-a1'));
    const ta = screen.getByTestId('regen-notes-input-a1') as HTMLTextAreaElement;
    fireEvent.input(ta, { target: { value: 'shorter, and cite sources' } });
    fireEvent.click(screen.getByTestId('regen-notes-submit-a1'));
    expect(got).toEqual({ msg: 'a1', notes: 'shorter, and cite sources' });
    expect(screen.queryByTestId('regen-menu-a1')).toBeNull();
  });

  it('disables the notes submit until text is entered', () => {
    render(() => (
      <Transcript
        messages={[ASSISTANT]}
        density="normal"
        onRegenerate={() => undefined}
        onRegenerateWithNotes={() => undefined}
      />
    ));
    fireEvent.click(screen.getByTestId('msg-regen-a1'));
    fireEvent.click(screen.getByTestId('regen-notes-a1'));
    const submit = screen.getByTestId(
      'regen-notes-submit-a1',
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('model flow passes the chosen provider/model pair', () => {
    let got: { msg: string; provider: string; model: string } | null = null;
    render(() => (
      <Transcript
        messages={[ASSISTANT]}
        density="normal"
        onRegenerate={() => undefined}
        onRegenerateWithModel={(m, model) => {
          got = { msg: m.id, provider: model.providerId, model: model.modelId };
        }}
        models={MODELS}
      />
    ));
    fireEvent.click(screen.getByTestId('msg-regen-a1'));
    fireEvent.click(screen.getByTestId('regen-model-a1'));
    fireEvent.click(screen.getByTestId('regen-pick-alcf:gpt-oss-a1'));
    expect(got).toEqual({ msg: 'a1', provider: 'alcf', model: 'gpt-oss' });
  });

  it('hides the with-model option when no models are available', () => {
    render(() => (
      <Transcript
        messages={[ASSISTANT]}
        density="normal"
        onRegenerate={() => undefined}
        onRegenerateWithNotes={() => undefined}
        onRegenerateWithModel={() => undefined}
        models={[]}
      />
    ));
    fireEvent.click(screen.getByTestId('msg-regen-a1'));
    expect(screen.getByTestId('regen-menu-a1')).toBeTruthy();
    expect(screen.queryByTestId('regen-model-a1')).toBeNull();
  });
});
