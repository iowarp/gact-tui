/**
 * UI component: Composer Attachments.
 */
import { For, Show } from 'solid-js';
import { humanSize } from '../presentationUtils.js';
import { Icon } from './Icon.js';
import { Spinner } from './ui/Spinner.js';

export interface AttachedFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  kind?: 'upload';
  path?: string;
  pending?: boolean;
  error?: string;
}

export interface AttachmentChipsProps {
  attachments: AttachedFile[];
  onRetryUpload: (id: string) => void;
  onRemoveAttachment: (id: string) => void;
}

export function AttachmentChips(props: AttachmentChipsProps) {
  return (
    <div class="composer__chips" data-testid="composer-attachments">
      <For each={props.attachments}>
        {(attachment) => (
          <span
            class="composer__chip"
            classList={{
              'composer__chip--pending': !!attachment.pending,
              'composer__chip--error': !!attachment.error,
            }}
            data-testid={`composer-attachment-${attachment.id}`}
            title={
              attachment.error
                ? `Upload failed: ${attachment.error}`
                : (attachment.path ?? attachment.name)
            }
          >
            <Show
              when={attachment.pending}
              fallback={<Icon name={attachment.error ? 'close' : 'attach'} size={11} />}
            >
              <Spinner class="composer__chip-spin" label="uploading" />
            </Show>
            <span class="composer__chip-name">{attachment.name}</span>
            <Show
              when={attachment.error}
              fallback={
                <span class="composer__chip-size">
                  {attachment.pending ? 'uploading…' : humanSize(attachment.size)}
                </span>
              }
            >
              <span class="composer__chip-size composer__chip-size--error">failed</span>
              <button
                type="button"
                class="composer__chip-retry"
                onClick={() => props.onRetryUpload(attachment.id)}
                data-testid={`composer-attachment-retry-${attachment.id}`}
                aria-label={`Retry upload of ${attachment.name}`}
              >
                Retry
              </button>
            </Show>
            <button
              type="button"
              class="composer__chip-x"
              onClick={() => props.onRemoveAttachment(attachment.id)}
              aria-label={`Remove ${attachment.name}`}
            >
              <Icon name="close" size={10} />
            </button>
          </span>
        )}
      </For>
    </div>
  );
}
