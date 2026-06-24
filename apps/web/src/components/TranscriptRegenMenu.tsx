/**
 * The regenerate dropdown menu attached to an assistant message (retry, switch
 * model/provider, edit-and-resend).
 */
import { Show, createEffect, createSignal } from 'solid-js';
import type { Message } from '@clio/core';
import type { ModelOption } from './ComposerTypes.js';
import { Icon } from './Icon.js';
import { registerDocumentEvent, registerDocumentKeydown } from '../domListeners.js';
import {
  RegenMenuChoices,
  RegenModelChoices,
  RegenNotesForm,
  type RegenMenuMode,
} from './TranscriptRegenMenuSections.js';

/** Regenerate variant menu (1.0 item 4). Plain regenerate, regenerate with
 * notes (inline textarea), and regenerate with a different model — all ride
 * clio's retry route which accepts `notes` + `provider_id`/`model_id`. */
export function RegenMenu(props: {
  msg: Message;
  models?: ModelOption[];
  onRegenerate?: (msg: Message) => void;
  onRegenerateWithNotes?: (msg: Message, notes: string) => void;
  onRegenerateWithModel?: (msg: Message, model: ModelOption) => void;
}) {
  const [open, setOpen] = createSignal(false);
  const [mode, setMode] = createSignal<RegenMenuMode>('menu');
  const [notes, setNotes] = createSignal('');
  let rootEl: HTMLSpanElement | undefined;

  const hasVariants = () => Boolean(props.onRegenerateWithNotes || props.onRegenerateWithModel);
  const canUseModels = () =>
    Boolean(props.onRegenerateWithModel && (props.models?.length ?? 0) > 0);

  function close() {
    setOpen(false);
    setMode('menu');
    setNotes('');
  }

  // Close on outside click / Escape while open.
  createEffect(() => {
    if (!open()) return;
    const onDoc = (e: MouseEvent) => {
      if (rootEl && !rootEl.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    registerDocumentEvent('mousedown', onDoc);
    registerDocumentKeydown(onKey, true);
  });

  return (
    <span class="trx-regen" ref={rootEl}>
      <button
        type="button"
        class="trx-msg__action"
        title="Regenerate response"
        data-testid={`msg-regen-${props.msg.id}`}
        onClick={() => {
          // Without variant callbacks (fixtures / older call sites) keep the
          // original immediate-regenerate behaviour.
          if (!hasVariants()) {
            props.onRegenerate?.(props.msg);
            return;
          }
          if (open()) close();
          else setOpen(true);
        }}
      >
        <Icon name="regenerate" size={12} />
      </button>
      <Show when={open()}>
        <div class="trx-regen__menu" role="menu" data-testid={`regen-menu-${props.msg.id}`}>
          <Show when={mode() === 'menu'}>
            <RegenMenuChoices
              msg={props.msg}
              canUseNotes={Boolean(props.onRegenerateWithNotes)}
              canUseModels={canUseModels()}
              onPlain={() => {
                close();
                props.onRegenerate?.(props.msg);
              }}
              onNotes={() => setMode('notes')}
              onModels={() => setMode('models')}
            />
          </Show>
          <Show when={mode() === 'notes'}>
            <RegenNotesForm
              msg={props.msg}
              notes={notes()}
              onNotes={setNotes}
              onBack={() => setMode('menu')}
              onSubmit={() => {
                const n = notes().trim();
                if (!n) return;
                close();
                props.onRegenerateWithNotes?.(props.msg, n);
              }}
            />
          </Show>
          <Show when={mode() === 'models'}>
            <RegenModelChoices
              msg={props.msg}
              models={props.models ?? []}
              onBack={() => setMode('menu')}
              onPick={(model) => {
                close();
                props.onRegenerateWithModel?.(props.msg, model);
              }}
            />
          </Show>
        </div>
      </Show>
    </span>
  );
}
