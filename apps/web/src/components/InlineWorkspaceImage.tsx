/**
 * Inline image for a tool artifact referenced by a workspace file path (e.g. a
 * plot's `output_path`). The bytes are fetched lazily via `readWorkspaceImage`
 * (which calls `GET /v1/workspaces/{id}/files/read` and returns a data URL),
 * then rendered as a capped thumbnail that enlarges on click — mirroring the
 * TUI's inline artifact preview.
 */
import { Show, createResource, createSignal } from 'solid-js';

export function InlineWorkspaceImage(props: {
  path: string;
  readWorkspaceImage?: (path: string) => Promise<{ url: string; mediaType: string } | null>;
}) {
  const [enlarged, setEnlarged] = createSignal(false);
  const [image] = createResource(
    () => (props.readWorkspaceImage ? props.path : null),
    async (path) => {
      if (!props.readWorkspaceImage) return null;
      return props.readWorkspaceImage(path);
    },
  );

  const fileName = () => {
    const p = props.path.replace(/[/\\]+$/, '');
    const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
    return idx >= 0 ? p.slice(idx + 1) : p;
  };

  return (
    <div class="trx-tool__image" data-testid="trx-tool-image">
      <Show when={image.loading}>
        <div class="trx-tool__image-loading">loading {fileName()}…</div>
      </Show>
      <Show when={!image.loading && image()}>
        {(img) => (
          <button
            type="button"
            class="trx-image-thumb"
            classList={{ 'is-enlarged': enlarged() }}
            data-testid="trx-image-thumb"
            aria-expanded={enlarged()}
            title={enlarged() ? 'click to shrink' : 'click to enlarge'}
            onClick={(e) => {
              e.stopPropagation();
              setEnlarged((v) => !v);
            }}
          >
            <img class="trx-image" src={img().url} alt={fileName()} loading="lazy" data-testid="trx-image" />
            <span class="trx-image-thumb__hint" data-testid="trx-image-thumb-hint">
              {enlarged() ? 'collapse' : 'click to enlarge'}
            </span>
          </button>
        )}
      </Show>
      <Show when={!image.loading && !image()}>
        <div class="trx-tool__image-missing" data-testid="trx-tool-image-missing">
          image artifact: {fileName()}
        </div>
      </Show>
    </div>
  );
}
