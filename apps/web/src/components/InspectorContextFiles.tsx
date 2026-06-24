/**
 * Inspector "Context files" tab: lists the session's attached files with inline
 * preview, mode cycling (read/edit/pin), and removal controls.
 */
import { createMemo, createSignal, For, Show } from 'solid-js';
import type { ContextFile, ContextFileContent } from '@clio/core';
import { Icon } from './Icon.js';

export interface ContextFilesTabProps {
  files: ContextFile[];
  onPreviewContextFile?: (path: string) => Promise<ContextFileContent>;
  onRemoveContextFile?: (path: string) => void | Promise<void>;
  onCycleContextFileMode?: (path: string, next: 'read' | 'edit' | 'pin') => void | Promise<void>;
}

export function ContextFilesTab(props: ContextFilesTabProps) {
  const [previewFor, setPreviewFor] = createSignal<string | null>(null);
  const [previewData, setPreviewData] = createSignal<ContextFileContent | null>(null);
  const [previewErr, setPreviewErr] = createSignal('');

  async function openPreview(path: string) {
    if (!props.onPreviewContextFile) return;
    setPreviewFor(path);
    setPreviewData(null);
    setPreviewErr('');
    try {
      setPreviewData(await props.onPreviewContextFile(path));
    } catch (e) {
      setPreviewErr(e instanceof Error ? e.message : String(e));
    }
  }

  const previewText = createMemo(() => {
    const d = previewData();
    if (!d || d.media_type.startsWith('image/')) return '';
    try {
      const text = atob(d.data);
      return text.length > 20_000 ? text.slice(0, 20_000) + '\n…(truncated)' : text;
    } catch {
      return '(binary content)';
    }
  });

  return (
    <section class="inspector__sect">
      <div class="inspector__sect-title">Context files ({props.files.length})</div>
      <ul class="inspector__files">
        <For each={props.files}>
          {(f) => (
            <li
              class={'inspector__file inspector__file--' + (f.mode ?? 'read')}
              data-testid={`inspector-file-${f.path}`}
            >
              <Icon
                name={f.mode === 'edit' ? 'edit' : 'diff'}
                size={12}
                class="inspector__file-icon"
              />
              <span class="inspector__file-path" title={f.path}>
                {f.path}
              </span>
              <Show when={f.language}>
                <span class="inspector__file-lang">{f.language}</span>
              </Show>
              <Show when={props.onCycleContextFileMode}>
                <button
                  type="button"
                  class="inspector__file-mode"
                  title="Cycle mode: read → edit → pin"
                  onClick={() => {
                    const order: Array<'read' | 'edit' | 'pin'> = ['read', 'edit', 'pin'];
                    const cur = (f.mode ?? 'read') as 'read' | 'edit' | 'pin';
                    const next = order[(order.indexOf(cur) + 1) % order.length]!;
                    void props.onCycleContextFileMode?.(f.path, next);
                  }}
                >
                  {f.mode ?? 'read'}
                </button>
              </Show>
              <Show when={props.onPreviewContextFile}>
                <button
                  type="button"
                  class="inspector__file-mode"
                  title="Preview file content"
                  data-testid={`inspector-file-preview-${f.path}`}
                  onClick={() => void openPreview(f.path)}
                >
                  view
                </button>
              </Show>
              <Show when={props.onRemoveContextFile}>
                <button
                  type="button"
                  class="inspector__file-x"
                  title="Remove from context"
                  aria-label={`Remove ${f.path} from context`}
                  onClick={() => void props.onRemoveContextFile?.(f.path)}
                >
                  <Icon name="close" size={10} />
                </button>
              </Show>
            </li>
          )}
        </For>
      </ul>
      <Show when={previewFor()}>
        <div class="inspector__preview" data-testid="inspector-file-preview-panel">
          <div class="inspector__preview-head">
            <span class="inspector__preview-path" title={previewFor()!}>
              {previewFor()}
            </span>
            <button
              type="button"
              class="inspector__file-x"
              onClick={() => setPreviewFor(null)}
              aria-label="Close preview"
            >
              <Icon name="close" size={10} />
            </button>
          </div>
          <Show when={previewErr()}>
            <div class="inspector__preview-err">{previewErr()}</div>
          </Show>
          <Show when={!previewData() && !previewErr()}>
            <div class="inspector__preview-loading skeleton" />
          </Show>
          <Show when={previewData()}>
            <Show
              when={previewData()!.media_type.startsWith('image/')}
              fallback={
                <pre class="inspector__preview-text" data-testid="inspector-preview-text">
                  {previewText()}
                </pre>
              }
            >
              <img
                class="inspector__preview-img"
                src={`data:${previewData()!.media_type};base64,${previewData()!.data}`}
                alt={previewData()!.display_path ?? previewData()!.path}
                data-testid="inspector-preview-image"
              />
            </Show>
          </Show>
        </div>
      </Show>
    </section>
  );
}
