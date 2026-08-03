/**
 * UI component: Composer Action Row. Renders `ComposerActionRow` from `ComposerActionRowProps`.
 */
import { Show, type Accessor, type Setter } from 'solid-js';
import type { Client } from '@clio/core';
import type { MentionItem } from './AtMentionPicker.js';
import { ComposerAttachMenu } from './ComposerAttachMenu.js';
import {
  createComposerAttachmentState,
  type ComposerAttachmentStateOptions,
} from './ComposerAttachmentState.js';
import { ComposerTextarea } from './ComposerTextarea.js';
import { ComposerVoiceControls } from './ComposerVoiceControls.js';
import {
  createComposerVoiceState,
  type ComposerVoiceStateOptions,
} from './ComposerVoiceState.js';
import { Icon } from './Icon.js';
import type { ComposerHistory } from './ComposerState.js';

export interface ComposerActionRowProps {
  attachments: ReturnType<typeof createComposerAttachmentState>;
  voice: ReturnType<typeof createComposerVoiceState>;
  text: Accessor<string>;
  setText: Setter<string>;
  history: ComposerHistory;
  submit: () => void | Promise<void>;
  pasteStash: Accessor<Record<string, string>>;
  setPasteStash: Setter<Record<string, string>>;
  pasteCompressThreshold?: number;
  placeholder?: string;
  mentionItems?: MentionItem[];
  workspaceClient?: Client;
  workspaceId?: string;
  onSlashTyped?: () => void;
  onOpenCommandPalette?: () => void;
  onTranscribeVoice?: ComposerVoiceStateOptions['transcribeVoice'] extends () => infer T
    ? T
    : never;
  attachmentsCapable?: boolean;
  onUploadFile?: ComposerAttachmentStateOptions['uploadFile'] extends () => infer T
    ? T
    : never;
  streaming?: boolean;
  busy: boolean;
  disabled?: boolean;
  stopping: boolean;
  onStop: () => void | Promise<void>;
}

export function ComposerActionRow(props: ComposerActionRowProps) {
  return (
    <div class="composer__row">
      <div class="composer__row-lead">
        <button
          type="button"
          class="composer__attach composer__command"
          title="Commands"
          aria-label="Open command menu"
          data-testid="composer-command"
          onClick={() => props.onOpenCommandPalette?.()}
        >
          <span class="composer__slash-icon" aria-hidden>
            /
          </span>
        </button>
        <ComposerAttachMenu
          open={props.attachments.attachMenuOpen()}
          attachmentsCapable={props.attachmentsCapable}
          uploadCapable={!!(props.attachmentsCapable && props.onUploadFile)}
          imageAttachAllowed={props.attachments.imageAttachAllowed()}
          onToggle={() => props.attachments.setAttachMenuOpen((v) => !v)}
          onClose={() => props.attachments.setAttachMenuOpen(false)}
          onUpload={props.attachments.openUpload}
          onUploadImage={props.attachments.openImageUpload}
          onMentionWorkspaceFile={props.attachments.mentionWorkspaceFile}
        />
        <Show when={props.onTranscribeVoice}>
          <ComposerVoiceControls
            voiceBusy={props.voice.voiceBusy()}
            recording={props.voice.recording()}
            recordingElapsedMs={props.voice.recordingElapsedMs()}
            onToggleMicRecording={() => void props.voice.toggleMicRecording()}
            onUploadAudio={props.voice.openVoiceFilePicker}
          />
        </Show>
      </div>
      <ComposerTextarea
        text={props.text}
        setText={props.setText}
        history={props.history}
        submit={props.submit}
        pasteStash={props.pasteStash}
        setPasteStash={props.setPasteStash}
        pasteCompressThreshold={props.pasteCompressThreshold}
        placeholder={props.placeholder}
        mentionItems={props.mentionItems}
        workspaceClient={props.workspaceClient}
        workspaceId={props.workspaceId}
        onSlashTyped={props.onSlashTyped}
      />
      <Show
        when={props.streaming}
        fallback={
          <button
            type="button"
            class="composer__send"
            disabled={!props.text().trim() || props.busy || props.disabled}
            data-testid="composer-send"
            onClick={() => void props.submit()}
            aria-label="Send message"
          >
            <Icon name="send" size={16} />
          </button>
        }
      >
        <button
          type="button"
          class={
            'composer__send composer__send--stop ' +
            (props.stopping ? 'composer__send--stopping' : '')
          }
          data-testid="composer-stop"
          onClick={() => void props.onStop()}
          disabled={props.stopping}
          aria-label={props.stopping ? 'Stopping…' : 'Stop generation'}
          title={props.stopping ? 'Stopping…' : 'Stop generation'}
        >
          <Icon name="stop" size={14} />
        </button>
      </Show>
    </div>
  );
}
