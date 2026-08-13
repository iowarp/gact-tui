import {
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createResource,
  createSignal,
} from 'solid-js';
import type {
  ArtifactRecord,
  Client,
  DocumentAnchor,
  DocumentEditorSession,
  DocumentManifest,
  DocumentWorkingCopy,
} from '@clio/core';
import { Markdown } from './Markdown.js';
import { DocumentReviewComposer } from './DocumentReviewComposer.js';
import { DocumentTextViewer, sanitizeStaticDocumentHtml } from './DocumentTextViewer.js';
import { OnlyOfficeDocumentEditor } from './OnlyOfficeDocumentEditor.js';
import { PdfDocumentViewer } from './PdfDocumentViewer.js';
import { openDocumentPath } from '../tauri.js';
import './document-workspace.css';

export type DocumentWorkspaceClient = Pick<
  Client,
  | 'documentManifest'
  | 'documentContent'
  | 'artifactReviews'
  | 'submitArtifactReview'
  | 'createDocumentRendition'
  | 'createDocumentWorkingCopy'
  | 'createDocumentEditorSession'
>;

interface DocumentWorkspaceProps {
  artifact: ArtifactRecord;
  sessionId?: string;
  selectedPath: string;
  client: DocumentWorkspaceClient;
}

type DocumentTab = 'preview' | 'comments' | 'history' | 'policy';

function profileLabel(manifest: DocumentManifest | undefined): string {
  if (!manifest) return 'Document';
  const labels: Record<string, string> = {
    markdown: 'Markdown',
    pdf: 'PDF',
    latex: 'LaTeX',
    'html-static': 'Static HTML',
    'ooxml-word': 'Word',
    'ooxml-sheet': 'Excel',
    'ooxml-slides': 'PowerPoint',
    'odf-text': 'OpenDocument Text',
    'odf-sheet': 'OpenDocument Sheet',
    'odf-slides': 'OpenDocument Slides',
  };
  return labels[manifest.profile] ?? 'Document';
}

function canRenderDirectly(profile: DocumentManifest['profile']): boolean {
  return ['markdown', 'pdf', 'latex', 'html-static'].includes(profile);
}

export function DocumentWorkspace(props: DocumentWorkspaceProps) {
  const [tab, setTab] = createSignal<DocumentTab>('preview');
  const [overrideManifest, setOverrideManifest] = createSignal<DocumentManifest>();
  const [selection, setSelection] = createSignal<{
    anchor: DocumentAnchor;
    rect: DOMRect;
  }>();
  const [reviewSubmitting, setReviewSubmitting] = createSignal(false);
  const [reviewError, setReviewError] = createSignal('');
  const [actionStatus, setActionStatus] = createSignal('');
  const [workingCopy, setWorkingCopy] = createSignal<DocumentWorkingCopy>();
  const [editor, setEditor] = createSignal<DocumentEditorSession>();

  createEffect(() => {
    // DocumentWorkspace is retained while the selected rail item changes. Reset every
    // document-local projection when the logical artifact changes so a derived preview,
    // historical revision, selection, or editor can never leak into the next file.
    void `${props.artifact.workspace_id}\0${props.artifact.name}\0${props.selectedPath}`;
    setTab('preview');
    setOverrideManifest(undefined);
    setSelection(undefined);
    setReviewError('');
    setActionStatus('');
    setWorkingCopy(undefined);
    setEditor(undefined);
  });

  const [manifest, { refetch: refetchManifest }] = createResource(
    () => props.artifact.head_artifact_id,
    (artifactId) => props.client.documentManifest(artifactId),
  );
  const effectiveManifest = createMemo(() => overrideManifest() ?? manifest());
  const [content] = createResource(
    () => {
      const value = effectiveManifest();
      if (!value || !canRenderDirectly(value.profile)) return null;
      return value.artifact_id;
    },
    (artifactId) => props.client.documentContent(artifactId),
  );
  const [text] = createResource(
    () => {
      const value = effectiveManifest();
      const blob = content();
      if (!value || !blob || !['markdown', 'latex', 'html-static'].includes(value.profile)) {
        return null;
      }
      return blob;
    },
    (blob) => blob.text(),
  );
  const [reviews, { refetch: refetchReviews }] = createResource(
    () => props.artifact.head_artifact_id,
    (artifactId) => props.client.artifactReviews(artifactId),
  );

  async function submitReview(comment: string) {
    const selected = selection();
    const value = effectiveManifest();
    if (!selected || !value || !props.sessionId) {
      setReviewError('Select an active session before sending a review.');
      return;
    }
    setReviewSubmitting(true);
    setReviewError('');
    try {
      await props.client.submitArtifactReview(props.sessionId, {
        artifact_id: value.artifact_id,
        expected_version: value.version,
        expected_sha256: value.sha256,
        anchor: selected.anchor,
        text: comment,
        idempotency_key: `ui-review-${crypto.randomUUID()}`,
        allow_historical: value.artifact_id !== props.artifact.head_artifact_id,
      });
      setSelection(undefined);
      setActionStatus('Comment sent to the agent against this exact revision.');
      await refetchReviews();
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : 'Could not send review');
    } finally {
      setReviewSubmitting(false);
    }
  }

  async function renderPreview() {
    const value = manifest();
    if (!value || !props.sessionId) {
      setActionStatus('Select an active session before rendering a preview.');
      return;
    }
    setActionStatus('Rendering PDF preview…');
    try {
      const rendition = await props.client.createDocumentRendition(
        value.artifact_id,
        props.sessionId,
      );
      setOverrideManifest(rendition);
      setTab('preview');
      setActionStatus('Showing a derived PDF rendition; the native file remains canonical.');
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : 'Preview rendering failed');
    }
  }

  async function launch(provider: 'native' | 'onlyoffice' | 'collabora') {
    const value = manifest();
    if (!value || !props.sessionId) {
      setActionStatus('Select an active session before opening an editor.');
      return;
    }
    setActionStatus(
      provider === 'native' ? 'Preparing native working copy…' : `Starting ${provider}…`,
    );
    try {
      const copy = await props.client.createDocumentWorkingCopy(value.artifact_id, {
        session_id: props.sessionId,
        provider,
        writable: true,
        auto_checkpoint: true,
      });
      setWorkingCopy(copy);
      if (provider === 'native') {
        const opened = await openDocumentPath(copy.path);
        if (opened) {
          setActionStatus(
            'Opened in the system editor. Stable saves automatically become immutable revisions.',
          );
        } else {
          await navigator.clipboard?.writeText(copy.path);
          setActionStatus(`Working-copy path copied: ${copy.path}`);
        }
        return;
      }
      const launched = await props.client.createDocumentEditorSession(copy.id, provider);
      setEditor(launched);
      if (launched.status !== 'ready') {
        setActionStatus(launched.error || `${provider} is unavailable`);
      } else {
        setActionStatus(
          `${provider === 'onlyoffice' ? 'ONLYOFFICE' : 'Collabora'} editing session ready.`,
        );
      }
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : 'Could not open editor');
    }
  }

  async function viewVersion(artifactId: string) {
    try {
      const historical = await props.client.documentManifest(artifactId);
      setOverrideManifest(historical);
      setTab('preview');
      setActionStatus(`Viewing immutable version ${historical.version}.`);
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : 'Could not load version');
    }
  }

  const editorValue = () => editor();
  const manifestValue = () => effectiveManifest();

  return (
    <section class="document-workspace" data-testid="document-workspace">
      <header class="document-workspace__toolbar">
        <div>
          <strong>{profileLabel(manifestValue())}</strong>
          <Show when={manifestValue()}>
            <span class="document-workspace__revision">
              v{manifestValue()!.version} · {manifestValue()!.sha256.slice(0, 9)}
            </span>
          </Show>
        </div>
        <div class="document-workspace__actions">
          <Show when={manifestValue()?.native_open}>
            <button type="button" onClick={() => void launch('native')}>
              Open native
            </button>
          </Show>
          <For each={manifest()?.embedded_editors ?? []}>
            {(provider) => (
              <button type="button" onClick={() => void launch(provider)}>
                Edit in {provider === 'onlyoffice' ? 'ONLYOFFICE' : 'Collabora'}
              </button>
            )}
          </For>
          <Show
            when={
              manifest()?.rendition_formats.includes('pdf') &&
              !canRenderDirectly(manifest()!.profile)
            }
          >
            <button type="button" onClick={() => void renderPreview()}>
              Render preview
            </button>
          </Show>
          <button
            type="button"
            title="Refresh document revision"
            onClick={() => {
              setOverrideManifest(undefined);
              void refetchManifest();
              void refetchReviews();
            }}
          >
            Refresh
          </button>
        </div>
      </header>

      <nav class="document-workspace__tabs" aria-label="Document workspace">
        <For each={['preview', 'comments', 'history', 'policy'] as DocumentTab[]}>
          {(value) => (
            <button
              type="button"
              classList={{ active: tab() === value }}
              onClick={() => setTab(value)}
            >
              {value[0]!.toUpperCase() + value.slice(1)}
              {value === 'comments' && reviews()?.length ? ` ${reviews()!.length}` : ''}
            </button>
          )}
        </For>
      </nav>

      <Show when={actionStatus()}>
        <p class="document-workspace__status" data-testid="document-action-status">
          {actionStatus()}
        </p>
      </Show>

      <div class="document-workspace__body">
        <Show
          when={tab() === 'preview'}
          fallback={
            <Switch>
              <Match when={tab() === 'comments'}>
                <div class="document-comments" data-testid="document-comments">
                  <Show
                    when={reviews()?.length}
                    fallback={<p>No comments on this artifact chain yet.</p>}
                  >
                    <For each={reviews()}>
                      {(review) => (
                        <article>
                          <header>
                            <span>{review.native ? 'Native comment' : 'CLIO comment'}</span>
                            <span>v{review.artifact_version}</span>
                            <span class={`document-comment__status status-${review.status}`}>
                              {review.status}
                            </span>
                          </header>
                          <q>{review.anchor.exact || review.anchor.cell_range || 'Selection'}</q>
                          <p>{review.text}</p>
                        </article>
                      )}
                    </For>
                  </Show>
                </div>
              </Match>
              <Match when={tab() === 'history'}>
                <div class="document-history" data-testid="document-history">
                  <For each={[...props.artifact.versions].reverse()}>
                    {(version) => (
                      <button
                        type="button"
                        classList={{
                          active: manifestValue()?.artifact_id === version.artifact_id,
                        }}
                        onClick={() => void viewVersion(version.artifact_id)}
                      >
                        <strong>Version {version.version}</strong>
                        <span>{version.sha256?.slice(0, 12) || 'unhashed'}</span>
                        <time>{version.created_at || ''}</time>
                      </button>
                    )}
                  </For>
                </div>
              </Match>
              <Match when={tab() === 'policy'}>
                <div class="document-policy" data-testid="document-policy">
                  <h3>Document safety and compatibility</h3>
                  <ul>
                    <li>The native file is canonical; previews and PDF renditions are derived.</li>
                    <li>Every save creates or deduplicates an immutable artifact revision.</li>
                    <li>Comments are bound to an exact version and stale anchors are rejected.</li>
                    <li>
                      Static HTML cannot run scripts. Interactive HTML moves to Live Web with its
                      separate consent and provenance.
                    </li>
                    <li>
                      Embedded editors receive short-lived access to one working copy. They receive
                      no CLIO credentials.
                    </li>
                  </ul>
                  <Show when={workingCopy()}>
                    <p>
                      Working copy {workingCopy()!.id} · {workingCopy()!.status} · head v
                      {workingCopy()!.head_version}
                    </p>
                  </Show>
                </div>
              </Match>
            </Switch>
          }
        >
          <Show
            when={!editorValue() || editorValue()?.status !== 'ready'}
            fallback={
              <Show
                when={editorValue()?.provider === 'onlyoffice'}
                fallback={
                  <iframe
                    class="document-embedded-editor"
                    title="Collabora document editor"
                    src={editorValue()?.editor_url}
                    sandbox="allow-scripts allow-forms allow-same-origin allow-downloads allow-popups"
                  />
                }
              >
                <OnlyOfficeDocumentEditor
                  editorUrl={editorValue()!.editor_url!}
                  config={editorValue()!.config ?? {}}
                />
              </Show>
            }
          >
            <Switch fallback={<div class="document-workspace__empty">Preview unavailable.</div>}>
              <Match when={manifestValue()?.profile === 'pdf' && content()}>
                <PdfDocumentViewer
                  blob={content()!}
                  onSelection={(anchor, rect) => setSelection({ anchor, rect })}
                />
              </Match>
              <Match when={manifestValue()?.profile === 'markdown' && text()}>
                <DocumentTextViewer
                  profile="markdown"
                  sourcePath={props.selectedPath}
                  onSelection={(anchor, rect) => setSelection({ anchor, rect })}
                >
                  <Markdown text={text()!} />
                </DocumentTextViewer>
              </Match>
              <Match when={manifestValue()?.profile === 'latex' && text()}>
                <DocumentTextViewer
                  profile="latex"
                  sourcePath={props.selectedPath}
                  html={`<pre>${text()!
                    .replaceAll('&', '&amp;')
                    .replaceAll('<', '&lt;')
                    .replaceAll('>', '&gt;')}</pre>`}
                  onSelection={(anchor, rect) => setSelection({ anchor, rect })}
                />
              </Match>
              <Match when={manifestValue()?.profile === 'html-static' && text()}>
                <DocumentTextViewer
                  profile="html-static"
                  sourcePath={props.selectedPath}
                  html={sanitizeStaticDocumentHtml(text()!)}
                  onSelection={(anchor, rect) => setSelection({ anchor, rect })}
                />
              </Match>
              <Match when={manifest.loading || content.loading}>
                <div class="document-workspace__empty">Loading document…</div>
              </Match>
              <Match when={manifestValue() && !canRenderDirectly(manifestValue()!.profile)}>
                <div class="document-workspace__empty">
                  <strong>{profileLabel(manifestValue())} remains the canonical file.</strong>
                  <p>
                    Open it natively, use an embedded editor, or create a read-only PDF preview.
                  </p>
                </div>
              </Match>
            </Switch>
          </Show>
        </Show>
      </div>

      <Show when={selection()}>
        {(selected) => (
          <DocumentReviewComposer
            anchor={selected().anchor}
            rect={selected().rect}
            submitting={reviewSubmitting()}
            error={reviewError()}
            onSubmit={(comment) => void submitReview(comment)}
            onCancel={() => {
              setSelection(undefined);
              window.getSelection()?.removeAllRanges();
            }}
          />
        )}
      </Show>
    </section>
  );
}
