/**
 * Type definitions for Composer.
 */
import type { JSX } from 'solid-js';
import type { Client } from '@clio/core';
import type { MentionItem } from './AtMentionPicker.js';

export type PermissionMode = 'ask' | 'auto-edits' | 'plan' | 'auto' | 'bypass';

export interface ModelOption {
  /** Globally-unique id used by the dropdown ("<provider>:<model>"). */
  id: string;
  providerId: string;
  modelId: string;
  providerLabel: string;
  description?: string;
  disabled?: boolean;
}

export type ProviderAvailability = 'ok' | 'setup' | 'offline';

export interface ModelProviderOption {
  id: string;
  label: string;
  status: ProviderAvailability;
  statusLabel: string;
  disabled?: boolean;
  detail?: string;
  models: ModelOption[];
}

export interface ComposerProps {
  backendLabel?: string;
  disabled?: boolean;
  /** When provided, replaces the static backend chip in the picker row. */
  backendSlot?: JSX.Element;
  /** Optional right-side content in the composer footer. */
  footerSlot?: JSX.Element;
  streaming?: boolean;
  onStop?: () => void | Promise<void>;
  mentionItems?: MentionItem[];
  onSubmit?: (text: string) => Promise<void> | void;

  /**
   * Upload a file's bytes to the backend (POST /attachments). Returns the
   * registered context-file path. When absent or `attachmentsCapable` is
   * false, the Upload menu item is hidden — references still work via @.
   */
  onUploadFile?: (file: File) => Promise<{ path?: string } | void>;
  /** Backend advertises capabilities.attachments_upload. */
  attachmentsCapable?: boolean;
  /**
   * A2 — backend advertises capabilities.multimodal_image_parts (or a
   * vision-capable provider). When false the dedicated "Attach image…"
   * affordance is disabled with an explanatory tooltip; generic file
   * upload and text are unaffected. Defaults to true (capability absent
   * is treated as "allowed" — only an explicit `false` gates).
   */
  imageAttachCapable?: boolean;

  /** Live model options pulled from /v1/providers. */
  models?: ModelOption[];
  /** Provider-grouped model options for the provider -> model flyout. */
  modelProviders?: ModelProviderOption[];
  /** Currently-selected model id. */
  selectedModelId?: string;
  onPickModel?: (m: ModelOption) => void | Promise<void>;

  /** Selected permission mode. */
  permMode?: PermissionMode;
  onPickPermMode?: (m: PermissionMode) => void | Promise<void>;

  /**
   * Fires when the user types `/` as the first character into an
   * otherwise empty composer. ChatScreen wires it to open the slash
   * command palette.
   */
  onSlashTyped?: () => void;

  /** Explicit command-menu affordance rendered beside the attach button. */
  onOpenCommandPalette?: () => void;

  /**
   * Identifier that scopes a per-session localStorage draft. When the
   * key changes (user switches sessions), the current draft is
   * flushed under the old key and the new one is loaded into the
   * textarea. Drafts are cleared on successful submit.
   */
  draftKey?: string;

  /**
   * Bump to force the composer to re-hydrate its draft from
   * localStorage. ChatScreen wires this to the compose modal closing
   * so edits made there land back in the inline textarea immediately.
   */
  draftReloadTick?: number;

  /** Optional override for the textarea placeholder. */
  placeholder?: string;

  /** Live workspace `@`-picker — when both are set the picker also
   * shows files from `/v1/workspaces/{id}/files` underneath the
   * mentionItems entries. */
  workspaceClient?: Client;
  workspaceId?: string;

  /**
   * When a paste is at least this many lines, replace it with a
   * `[pasted N lines · click to expand]` chip. Defaults to 3.
   * Set to 0 to disable.
   */
  pasteCompressThreshold?: number;

  /** When set, renders a voice → text button next to the attach
   * affordance. ChatScreen wires this to
   * `client.transcribeVoice(activeId, audioBlob)`. */
  onTranscribeVoice?: (audio: Blob, filename: string) => Promise<string>;
}
