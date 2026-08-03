/**
 * UI component: Composer. Exports `Composer`.
 */
import { Show, onCleanup, onMount } from 'solid-js';
import { Icon } from './Icon.js';
import { ComposerActionRow } from './ComposerActionRow.js';
import { AttachmentChips } from './ComposerAttachments.js';
import { ComposerPickers } from './ComposerPickers.js';
import type { ComposerProps } from './ComposerTypes.js';
import { createComposerController } from './ComposerController.js';
import './composer.css';

export type { AttachedFile } from './ComposerAttachments.js';
export type { ComposerProps, ModelOption, PermissionMode } from './ComposerTypes.js';

export function Composer(props: ComposerProps = {}) {
  const controller = createComposerController(props);
  let rootEl!: HTMLDivElement;

  // Publish the composer's LIVE rendered height into --composer-h on the chat
  // layout root (.chat__main-col). The "jump to latest" pill is absolutely
  // positioned against that root and derives its clearance from --composer-h,
  // so it must track the composer's real height — which changes when the
  // ComposerPickers row wraps to two lines (narrow main column) or a docked
  // context footer appears. A static magic number regressed: it under-measured
  // the one-line composer and overlapped the top band once the picker row
  // wrapped. Measuring the border box removes the guesswork at any wrap state.
  onMount(() => {
    const target = rootEl.closest('.chat__main-col') as HTMLElement | null;
    if (!target || typeof ResizeObserver === 'undefined') return;
    const publish = () => {
      const height = Math.round(rootEl.getBoundingClientRect().height);
      if (height > 0) target.style.setProperty('--composer-h', `${height}px`);
    };
    const observer = new ResizeObserver(publish);
    observer.observe(rootEl);
    publish();
    onCleanup(() => {
      observer.disconnect();
      target.style.removeProperty('--composer-h');
    });
  });

  return (
    <div
      ref={rootEl}
      class={'composer ' + (controller.attachments.dragging() ? 'composer--dragging' : '')}
      data-testid="composer"
      onDragOver={controller.attachments.onDragOver}
      onDragLeave={controller.attachments.onDragLeave}
      onDrop={controller.attachments.onDrop}
    >
      <Show when={controller.attachments.dragging()}>
        <div class="composer__droptarget" aria-hidden>
          <Icon name="attach" size={24} />
          <span>Drop files to attach</span>
        </div>
      </Show>
      <Show when={controller.error()}>
        <div class="composer__error" data-testid="composer-error">
          {controller.error()}
        </div>
      </Show>

      <div class="composer__shell">
        <Show when={controller.attachments.uploads.attachments().length > 0}>
          <AttachmentChips
            attachments={controller.attachments.uploads.attachments()}
            onRetryUpload={controller.attachments.uploads.retryUpload}
            onRemoveAttachment={controller.attachments.uploads.removeAttachment}
          />
        </Show>

        <input
          ref={controller.attachments.setFileInputRef}
          type="file"
          multiple
          hidden
          onChange={controller.attachments.onFilesPicked}
          data-testid="composer-file-input"
        />

        <input
          ref={controller.attachments.setImageInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={controller.attachments.onFilesPicked}
          data-testid="composer-image-input"
        />

        <input
          ref={controller.voice.setVoiceInputRef}
          type="file"
          accept="audio/*"
          hidden
          onChange={controller.voice.onVoicePicked}
          data-testid="composer-voice-input"
        />

        <ComposerActionRow
          attachments={controller.attachments}
          voice={controller.voice}
          text={controller.text}
          setText={controller.setText}
          history={controller.history}
          submit={controller.submit}
          pasteStash={controller.pasteStash}
          setPasteStash={controller.setPasteStash}
          pasteCompressThreshold={props.pasteCompressThreshold}
          placeholder={props.placeholder}
          mentionItems={props.mentionItems}
          workspaceClient={props.workspaceClient}
          workspaceId={props.workspaceId}
          onSlashTyped={props.onSlashTyped}
          onOpenCommandPalette={props.onOpenCommandPalette}
          onTranscribeVoice={props.onTranscribeVoice}
          attachmentsCapable={props.attachmentsCapable}
          onUploadFile={props.onUploadFile}
          streaming={props.streaming}
          busy={controller.busy()}
          disabled={props.disabled}
          stopping={controller.stopping()}
          onStop={controller.handleStop}
        />

        <ComposerPickers
          backendLabel={props.backendLabel}
          backendSlot={props.backendSlot}
          permMode={controller.permMode()}
          permItems={controller.permItems()}
          modelProviders={props.modelProviders}
          modelItems={controller.modelItems()}
          selectedModelId={controller.selectedModelId()}
          selectedModelLabel={controller.selectedModel()?.modelId ?? 'pick model'}
          onPickPermMode={controller.setPerm}
          onPickModel={controller.pickModel}
        />
      </div>

      <div class="composer__footer">
        <div class="composer__hint">
        <span class="composer__kbd">Enter</span> to send ·{' '}
        <span class="composer__kbd">Shift + Enter</span> for newline ·{' '}
        <span class="composer__kbd">@</span> reference · <span class="composer__kbd">/</span>{' '}
        commands
        </div>
        <Show when={props.footerSlot}>
          <div class="composer__footer-slot">{props.footerSlot}</div>
        </Show>
      </div>
    </div>
  );
}
