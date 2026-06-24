/**
 * UI component: Shared Session Modal. Renders `SharedSessionModal` from `SharedSessionModalProps`.
 */
import { Show, createResource, createSignal, onMount } from 'solid-js';
import { brand } from '@brand';
import type { Client, Message } from '@clio/core';
import { Icon } from './Icon.js';
import { Transcript } from './Transcript.js';
import { registerWindowKeydown } from '../domListeners.js';
import { trapFocusRef } from '../focus-trap.js';
import './shared-session-modal.css';

export interface SharedSessionModalProps {
  open: boolean;
  client: Client;
  onClose: () => void;
}

/**
 * Read-only viewer for a shared session token. Mirrors the TUI's
 * `/open <token>` flow — paste a `clio:` share token (or full URL),
 * fetch the snapshot via GET /v1/shared/{token}, and render the
 * transcript with no composer or actions.
 */
export function SharedSessionModal(props: SharedSessionModalProps) {
  const [tokenInput, setTokenInput] = createSignal('');
  const [submittedToken, setSubmittedToken] = createSignal<string | null>(null);
  let inputRef: HTMLInputElement | undefined;

  // Reset on close so reopening starts at the token prompt.
  let lastOpen = false;
  function syncReset() {
    if (props.open && !lastOpen) {
      setTokenInput('');
      setSubmittedToken(null);
      queueMicrotask(() => inputRef?.focus());
    }
    lastOpen = props.open;
  }

  const [shared] = createResource(
    () => (props.open && submittedToken() ? submittedToken() : null),
    async (tok) => {
      if (!tok) return null;
      try {
        return await props.client.loadSharedSession(tok);
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) } as {
          error: string;
        };
      }
    },
  );

  function submit() {
    const raw = tokenInput().trim();
    if (!raw) return;
    // Accept either a bare token or a `clio:` / URL pasting — pull
    // out the last segment after the final slash.
    const slashIdx = raw.lastIndexOf('/');
    const token = slashIdx >= 0 ? raw.slice(slashIdx + 1) : raw;
    setSubmittedToken(token);
  }

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!props.open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        props.onClose();
      }
    };
    registerWindowKeydown(onKey, true);
  });

  return (
    <Show when={props.open}>
      {(() => {
        syncReset();
        return (
          <>
            <div class="ssm__backdrop" onClick={props.onClose} />
            <div
              class="ssm"
              role="dialog"
              aria-modal="true"
              aria-label="Open shared session"
              ref={trapFocusRef}
              data-testid="shared-session-modal"
            >
              <header class="ssm__head">
                <span class="eyebrow">Shared session</span>
                <button
                  type="button"
                  class="ssm__close"
                  onClick={props.onClose}
                  aria-label="Close shared session modal"
                >
                  <Icon name="close" size={14} />
                </button>
              </header>

              <Show when={!submittedToken()}>
                <form
                  class="ssm__form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submit();
                  }}
                >
                  <label class="ssm__label" for="ssm-token">
                    Paste a {brand.name} share token or URL
                  </label>
                  <input
                    ref={inputRef}
                    id="ssm-token"
                    type="text"
                    class="ssm__input"
                    placeholder="e.g. clio:share:a1b2c3 …"
                    value={tokenInput()}
                    onInput={(e) => setTokenInput(e.currentTarget.value)}
                    data-testid="shared-session-token-input"
                  />
                  <div class="ssm__form-actions">
                    <button
                      type="submit"
                      class="ssm__open"
                      disabled={!tokenInput().trim()}
                      data-testid="shared-session-open"
                    >
                      Open
                    </button>
                  </div>
                </form>
              </Show>

              <Show when={submittedToken()}>
                <div class="ssm__viewer" data-testid="shared-session-viewer">
                  <Show when={shared.loading}>
                    <div class="ssm__status">Loading shared session…</div>
                  </Show>
                  <Show when={!shared.loading && shared() && 'error' in (shared() ?? {})}>
                    <div class="ssm__status ssm__status--err">
                      Could not open token: {(shared() as { error: string }).error}
                    </div>
                  </Show>
                  <Show
                    when={
                      !shared.loading &&
                      shared() &&
                      !('error' in (shared() ?? {})) &&
                      (shared() as { messages?: unknown }).messages
                    }
                  >
                    <Transcript
                      messages={
                        ((shared() as unknown as { messages?: Message[] }).messages ?? []) as Message[]
                      }
                      density="normal"
                    />
                  </Show>
                </div>
              </Show>
            </div>
          </>
        );
      })()}
    </Show>
  );
}
