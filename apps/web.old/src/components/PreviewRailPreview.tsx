/**
 * UI component: Preview Rail Preview. Renders `PreviewRailPreview` from `PreviewRailPreviewProps`.
 */
import { Show } from 'solid-js';
import type { ContextFileContent } from '@clio/core';
import type { ArtifactRecord } from '@clio/core';
import { Icon } from './Icon.js';
import { DocumentWorkspace, type DocumentWorkspaceClient } from './DocumentWorkspace.js';
import type { PreviewRailClient } from './PreviewRailData.js';
import { Markdown } from './Markdown.js';
import {
  humanSize,
  imageFailureHint,
  TEXT_PREVIEW_CAP,
  type PreviewKind,
} from './PreviewRailModel.js';
import './inline-markdown.css';
import './preview-rail-preview.css';

export interface PreviewRailPreviewProps {
  selected: string;
  fileContent: ContextFileContent | null;
  contentLoading: boolean;
  readError: boolean;
  kind: PreviewKind | null;
  imageLoadFailed: boolean;
  selectedNodeSize?: number;
  dataUrl: string;
  highlighted: string | null;
  isMarkdownPreview: boolean;
  textBody: string;
  onImageLoadFailed: () => void;
  artifact?: ArtifactRecord;
  sessionId?: string;
  client: PreviewRailClient;
}

export function PreviewRailPreview(props: PreviewRailPreviewProps) {
  return (
    <div class="preview-rail__preview" data-testid="preview-rail-preview">
      <Show
        when={props.selected}
        fallback={
          <div class="preview-rail__placeholder" data-testid="preview-rail-no-selection">
            <Icon name="file" size={22} />
            <p>Select a file to preview it side-by-side.</p>
          </div>
        }
      >
        <div class="preview-rail__preview-head">
          <span class="preview-rail__preview-path" title={props.selected}>
            {props.selected}
          </span>
          <Show when={props.fileContent}>
            <span class="preview-rail__preview-size">{humanSize(props.fileContent!.size)}</span>
          </Show>
        </div>

        <div class="preview-rail__preview-body">
          <Show when={props.artifact}>
            {(artifact) => (
              <DocumentWorkspace
                artifact={artifact()}
                sessionId={props.sessionId}
                selectedPath={props.selected}
                client={props.client as DocumentWorkspaceClient}
              />
            )}
          </Show>
          <Show
            when={!props.artifact ? !props.contentLoading : undefined}
            fallback={
              !props.artifact ? <div class="preview-rail__placeholder">Loading…</div> : null
            }
          >
            <Show
              when={!props.readError}
              fallback={
                <div
                  class="preview-rail__placeholder preview-rail__placeholder--err"
                  data-testid="preview-rail-read-error"
                >
                  <Icon name="alert" size={22} />
                  <p>Could not read this file.</p>
                </div>
              }
            >
              <Show when={props.kind === 'image'}>
                <Show
                  when={!props.imageLoadFailed}
                  fallback={
                    <div
                      class="preview-rail__placeholder preview-rail__placeholder--err"
                      data-testid="preview-rail-image-error"
                    >
                      <Icon name="alert" size={22} />
                      <p>Could not render image bytes.</p>
                      <p class="preview-rail__hint">
                        {imageFailureHint(props.fileContent, props.selectedNodeSize)}
                      </p>
                      <p class="preview-rail__meta">
                        {props.fileContent?.media_type} · {humanSize(props.fileContent?.size)}
                      </p>
                    </div>
                  }
                >
                  <div class="preview-rail__image-wrap" data-testid="preview-rail-image">
                    <img
                      class="preview-rail__image"
                      src={props.dataUrl}
                      alt={props.selected}
                      onError={props.onImageLoadFailed}
                    />
                  </div>
                </Show>
              </Show>

              <Show when={props.kind === 'text'}>
                <Show
                  when={props.isMarkdownPreview}
                  fallback={
                    <pre class="preview-rail__code hljs" data-testid="preview-rail-text">
                      <code innerHTML={props.highlighted ?? ''} />
                    </pre>
                  }
                >
                  <div class="preview-rail__markdown" data-testid="preview-rail-markdown">
                    <Markdown text={props.textBody} />
                  </div>
                </Show>
              </Show>

              <Show when={props.kind === 'binary'}>
                <div class="preview-rail__placeholder" data-testid="preview-rail-binary">
                  <Icon name="file" size={22} />
                  <p>
                    {props.fileContent && props.fileContent.size > TEXT_PREVIEW_CAP
                      ? 'File too large to preview inline.'
                      : 'Binary file — no inline preview.'}
                  </p>
                  <p class="preview-rail__placeholder-meta">
                    {props.fileContent?.media_type} · {humanSize(props.fileContent?.size)}
                  </p>
                </div>
              </Show>
            </Show>
          </Show>
        </div>
      </Show>
    </div>
  );
}
