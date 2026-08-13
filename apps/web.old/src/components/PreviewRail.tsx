/**
 * UI component: Preview Rail. Renders `PreviewRail` from `PreviewRailProps`.
 */
import type { Accessor } from 'solid-js';
import { Icon } from './Icon.js';
import { PreviewRailBrowser } from './PreviewRailBrowser.js';
import { PreviewRailPreview } from './PreviewRailPreview.js';
import type { PreviewRailClient } from './PreviewRailData.js';
import { createPreviewRailController } from './PreviewRailController.js';
import './preview-rail.css';

export {
  buildTree,
  classifyPreview,
  flattenVisible,
  highlightedPreviewHtml,
  imageFailureHint,
  isMarkdownPreviewPath,
  previewDataUrl,
} from './PreviewRailModel.js';
export type { PreviewKind, TreeNode } from './PreviewRailModel.js';

/**
 * Right-side, collapsible preview rail — the "you can't do this in a terminal"
 * feature. A workspace file browser (built from the flat
 * `listWorkspaceFiles` tree) on top, a rendered preview pane below:
 *
 *   - images   → <img> from a base64 data URL
 *   - text/code → syntax-highlighted <pre> (highlight.js, lazy) when the
 *                 extension is known, plain escaped text otherwise
 *   - large/binary → an honest icon + size placeholder, no attempt to render
 *
 * The rail consumes core's `listWorkspaceFiles` / `readWorkspaceFile`
 * (workspace-scoped, GET endpoints already wired in @clio/core). It never
 * mutates anything.
 *
 * Width yields to chat: the host `.chat` grid column uses a CSS clamp so the
 * conversation can never be crushed below its minimum (see preview-rail.css /
 * chat.css). Open/closed state is persisted by the caller (ChatScreen).
 */

export interface PreviewRailProps {
  /** Active session's workspace id. When absent the rail shows an empty state
   * (no workspace → nothing to browse). */
  workspaceId: string | undefined;
  /** Core client used for the two read-only workspace endpoints. */
  client: PreviewRailClient;
  /** Close affordance — flips the persisted open flag in the host. */
  onClose: () => void;
  /** Optional externally-driven selection (e.g. clicking a context file in
   * the Inspector). When this changes to a non-empty path the rail selects
   * and previews it. */
  externalPath?: Accessor<string | undefined>;
  sessionId?: string;
  documentArtifactsEnabled?: boolean;
}

export function PreviewRail(props: PreviewRailProps) {
  const controller = createPreviewRailController({
    workspaceId: () => props.workspaceId,
    client: props.client,
    externalPath: props.externalPath,
  });

  return (
    <aside
      class="preview-rail"
      classList={{
        'preview-rail--document':
          props.documentArtifactsEnabled === true && !!controller.selectedArtifact(),
      }}
      data-testid="preview-rail"
    >
      <header class="preview-rail__head">
        <span class="preview-rail__title">
          <Icon name="folder" size={14} />
          Artifacts & Files
        </span>
        <button
          type="button"
          class="preview-rail__refresh"
          title="Refresh files"
          aria-label="Refresh files"
          data-testid="preview-rail-refresh"
          onClick={() => {
            void controller.refetchListing();
            void controller.refetchArtifacts();
          }}
        >
          <Icon name="refresh" size={14} />
        </button>
        <button
          type="button"
          class="preview-rail__close"
          title="Close preview rail"
          data-testid="preview-rail-close"
          onClick={props.onClose}
        >
          <Icon name="close" size={14} />
        </button>
      </header>

      <PreviewRailBrowser
        workspaceId={props.workspaceId}
        loading={controller.listing.loading}
        listError={controller.listError()}
        filter={controller.filter()}
        rows={controller.rows()}
        expanded={controller.expanded()}
        selected={controller.selected()}
        onFilter={controller.setFilter}
        onRowClick={controller.onRowClick}
      />

      <PreviewRailPreview
        selected={controller.selected()}
        fileContent={controller.fileContent()}
        contentLoading={controller.content.loading}
        readError={controller.readError()}
        kind={controller.kind()}
        imageLoadFailed={controller.imageLoadFailed()}
        selectedNodeSize={controller.selectedNode()?.size}
        dataUrl={controller.dataUrl()}
        highlighted={controller.highlighted()}
        isMarkdownPreview={controller.isMarkdownPreview()}
        textBody={controller.textBody()}
        onImageLoadFailed={() => controller.setImageLoadFailed(true)}
        artifact={props.documentArtifactsEnabled ? controller.selectedArtifact() : undefined}
        sessionId={props.sessionId}
        client={props.client}
      />
    </aside>
  );
}
