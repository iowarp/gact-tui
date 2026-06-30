/**
 * Composer slot of the conversation pane: wires the message Composer to the
 * chat submit/attachment actions. Exports {@link ChatConversationComposer}.
 */
import { Client } from '@clio/core';
import type { BackendHandle } from '../App.js';
import { Composer } from '../components/Composer.js';
import type {
  ModelOption,
  ModelProviderOption,
  PermissionMode,
} from '../components/ComposerTypes.js';
import { VersionBadge } from '../components/VersionBadge.js';
import type { SessionRow } from '../components/SessionsColumn.js';
import { hostFromUrl } from './chatScreenUtils.js';

export interface ChatConversationComposerProps {
  backendUrl: string;
  voiceCapable: boolean;
  caps?: BackendHandle['capabilities'];
  workspaceClient: Client;
  activeId: string;
  sessions: SessionRow[];
  selectedWorkspaceId?: string;
  composerDisabled: boolean;
  streaming?: boolean;
  draftReloadTick: number;
  models?: ModelOption[];
  modelProviders?: ModelProviderOption[];
  selectedModelId?: string;
  permMode?: PermissionMode;
  onSubmit?: (text: string) => Promise<void> | void;
  onStop?: () => void | Promise<void>;
  onSlashTyped: () => void;
  onOpenCommandPalette: () => void;
  onPickModel?: (model: ModelOption) => void | Promise<void>;
  onPickPermMode?: (mode: PermissionMode) => void | Promise<void>;
  onOpenSettings?: () => void;
  onAddRemote?: () => void;
}

export function ChatConversationComposer(props: ChatConversationComposerProps) {
  const activeWorkspaceId = () =>
    props.sessions.find((session) => session.id === props.activeId)?.workspace ??
    (props.selectedWorkspaceId === '__all' ? undefined : props.selectedWorkspaceId);

  return (
    <Composer
      backendLabel={hostFromUrl(props.backendUrl)}
      disabled={props.composerDisabled}
      streaming={props.streaming}
      onStop={props.onStop}
      onSubmit={props.onSubmit}
      onSlashTyped={props.onSlashTyped}
      onOpenCommandPalette={props.onOpenCommandPalette}
      placeholder={
        props.activeId ? undefined : 'Start a new conversation — first message becomes the title'
      }
      onTranscribeVoice={
        props.voiceCapable
          ? async (blob, name) => {
              const sessionId = props.activeId;
              if (!sessionId) throw new Error('No active session for transcription');
              const result = await props.workspaceClient.transcribeVoice(sessionId, blob, name);
              return result.text;
            }
          : undefined
      }
      attachmentsCapable={!!props.caps?.capabilities?.attachments_upload}
      imageAttachCapable={props.caps?.capabilities?.['multimodal_image_parts'] !== false}
      onUploadFile={
        props.caps?.capabilities?.attachments_upload
          ? async (file) => {
              const sessionId = props.activeId;
              if (!sessionId) throw new Error('No active session for upload');
              const row = await props.workspaceClient.uploadAttachment(sessionId, file);
              return { path: row.path };
            }
          : undefined
      }
      workspaceClient={props.workspaceClient}
      workspaceId={activeWorkspaceId()}
      models={props.models}
      selectedModelId={props.selectedModelId}
      onPickModel={props.onPickModel}
      permMode={props.permMode}
      onPickPermMode={props.onPickPermMode}
      draftKey={props.activeId || '__new'}
      draftReloadTick={props.draftReloadTick}
      modelProviders={props.modelProviders}
      footerSlot={<VersionBadge />}
    />
  );
}
