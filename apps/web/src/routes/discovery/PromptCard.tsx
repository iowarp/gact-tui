/**
 * Discovery surface: Prompt Card component. Key export `PromptCard`.
 */
import { createSignal, Show } from 'solid-js';
import type { Client, PromptDef } from '@clio/core';
import { useToast } from '../../components/Toast.js';
import { PromptCardPreview } from './PromptCardPreview.js';
import { PromptCardSummary } from './PromptCardSummary.js';
import {
  promptCardClass,
  promptErrorResult,
  promptPreviewText,
  promptSaveResult,
  promptValidationResult,
} from './PromptCardModel.js';
import {
  scopedWriteBody,
  scopeRequest,
  type PromptScopeContext,
} from './PromptScope.js';

export function PromptCard(props: {
  p: PromptDef;
  client?: Client;
  context?: PromptScopeContext;
  onSaved?: () => void;
}) {
  const [open, setOpen] = createSignal(false);
  const [preview, setPreview] = createSignal<string | null>(null);
  const [previewError, setPreviewError] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [draft, setDraft] = createSignal('');
  const [scope, setScope] = createSignal<'global' | 'workspace' | 'session'>('global');
  const [saving, setSaving] = createSignal(false);
  const [validating, setValidating] = createSignal(false);
  const [result, setResult] = createSignal<{ ok: boolean; msg: string } | null>(null);
  const toast = useToast();
  let cardRef: HTMLElement | undefined;

  function scrollCardIntoView() {
    if (typeof cardRef?.scrollIntoView !== 'function') return;
    cardRef.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  async function loadPreview() {
    if (preview() != null || loading()) return;
    setLoading(true);
    setPreviewError(null);
    try {
      if (!props.client) throw new Error('No client');
      const res = await props.client.getPrompt(props.p.id, scopeRequest(props.context));
      const text = promptPreviewText(res);
      setPreview(text);
      setDraft(text);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function validate() {
    if (!props.client || validating()) return;
    setValidating(true);
    setResult(null);
    try {
      const res = await props.client.validatePrompt(props.p.id, {
        ...scopeRequest(props.context),
        text: draft(),
      });
      setResult(promptValidationResult(res.validation_errors));
    } catch (e) {
      setResult(promptErrorResult(e));
    } finally {
      setValidating(false);
    }
  }

  async function save() {
    if (!props.client || saving()) return;
    setSaving(true);
    setResult(null);
    try {
      await props.client.savePrompt(props.p.id, scopedWriteBody(scope(), draft(), props.context));
      setResult(promptSaveResult(scope()));
      queueMicrotask(scrollCardIntoView);
      toast.push({ tone: 'success', title: 'Prompt saved', duration: 2200 });
    } catch (e) {
      setResult(promptErrorResult(e));
    } finally {
      setSaving(false);
    }
  }

  function toggle() {
    const next = !open();
    setOpen(next);
    if (next) {
      queueMicrotask(scrollCardIntoView);
      void loadPreview();
    }
  }

  return (
    <article
      ref={cardRef}
      class={promptCardClass(props.p, open())}
      data-testid={`prompt-card-${props.p.id}`}
      onClick={toggle}
      style={props.client ? 'cursor: pointer' : ''}
    >
      <PromptCardSummary prompt={props.p} />
      <Show when={open()}>
        <PromptCardPreview
          prompt={props.p}
          clientPresent={Boolean(props.client)}
          context={props.context}
          preview={preview()}
          previewError={previewError()}
          loading={loading()}
          draft={draft()}
          scope={scope()}
          saving={saving()}
          validating={validating()}
          result={result()}
          onDraft={setDraft}
          onScope={setScope}
          onValidate={() => void validate()}
          onSave={() => void save()}
        />
      </Show>
    </article>
  );
}
