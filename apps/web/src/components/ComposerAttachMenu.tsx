/**
 * UI component: Composer Attach Menu. Renders `ComposerAttachMenu` from `ComposerAttachMenuProps`.
 */
import { Show } from 'solid-js';
import { Icon } from './Icon.js';

export interface ComposerAttachMenuProps {
  open: boolean;
  attachmentsCapable?: boolean;
  uploadCapable: boolean;
  imageAttachAllowed: boolean;
  onToggle: () => void;
  onClose: () => void;
  onUpload: () => void;
  onUploadImage: () => void;
  onMentionWorkspaceFile: () => void;
}

export function ComposerAttachMenu(props: ComposerAttachMenuProps) {
  return (
    <div class="composer__attach-wrap">
      <button
        type="button"
        class="composer__attach"
        title="Add context"
        aria-label="Add context"
        aria-haspopup="menu"
        aria-expanded={props.open}
        data-testid="composer-attach"
        onClick={props.onToggle}
      >
        <Icon name="attach" size={16} />
      </button>
      <Show when={props.open}>
        <div class="composer__attach-backdrop" onClick={props.onClose} aria-hidden />
        <div class="composer__attach-menu" role="menu" data-testid="composer-attach-menu">
          <div class="composer__attach-menu-group">From your computer</div>
          <Show
            when={props.uploadCapable}
            fallback={
              <div
                class="composer__attach-menuitem is-disabled"
                data-testid="composer-attach-upload-disabled"
              >
                <Icon name="file" size={13} />
                <span class="composer__attach-menuitem-label">Upload from computer…</span>
                <span class="composer__attach-menuitem-sub">backend has no upload</span>
              </div>
            }
          >
            <button
              type="button"
              role="menuitem"
              class="composer__attach-menuitem"
              data-testid="composer-attach-upload"
              onClick={props.onUpload}
            >
              <Icon name="file" size={13} />
              <span class="composer__attach-menuitem-label">Upload from computer…</span>
              <span class="composer__attach-menuitem-sub">sends file bytes</span>
            </button>
          </Show>
          <Show
            when={props.uploadCapable && props.imageAttachAllowed}
            fallback={
              <Show when={props.uploadCapable}>
                <div
                  class="composer__attach-menuitem is-disabled"
                  data-testid="composer-attach-image-disabled"
                  title="This model/backend doesn't accept images"
                >
                  <Icon name="image" size={13} />
                  <span class="composer__attach-menuitem-label">Attach image…</span>
                  <span class="composer__attach-menuitem-sub">no image support</span>
                </div>
              </Show>
            }
          >
            <button
              type="button"
              role="menuitem"
              class="composer__attach-menuitem"
              data-testid="composer-attach-image"
              onClick={props.onUploadImage}
            >
              <Icon name="image" size={13} />
              <span class="composer__attach-menuitem-label">Attach image…</span>
              <span class="composer__attach-menuitem-sub">sends image bytes</span>
            </button>
          </Show>
          <div class="composer__attach-menu-group">In this workspace</div>
          <button
            type="button"
            role="menuitem"
            class="composer__attach-menuitem"
            data-testid="composer-attach-mention"
            onClick={props.onMentionWorkspaceFile}
          >
            <Icon name="mention" size={13} />
            <span class="composer__attach-menuitem-label">Reference a workspace file</span>
            <span class="composer__attach-menuitem-sub">@ — agent reads by path</span>
          </button>
        </div>
      </Show>
    </div>
  );
}
