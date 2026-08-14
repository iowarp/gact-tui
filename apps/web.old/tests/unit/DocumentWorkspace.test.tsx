import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ArtifactRecord, ArtifactReview, DocumentManifest } from '@clio/core';
import { DocumentWorkspace } from '../../src/components/DocumentWorkspace.js';
import {
  DocumentTextViewer,
  sanitizeStaticDocumentHtml,
} from '../../src/components/DocumentTextViewer.js';

afterEach(cleanup);

const artifact: ArtifactRecord = {
  workspace_id: 'ws-docs',
  name: 'brief.md',
  kind: 'report',
  latest_version: 2,
  head_artifact_id: 'artifact-v2',
  versions: [
    {
      artifact_id: 'artifact-v1',
      version: 1,
      sha256: '1'.repeat(64),
      created_at: '2026-07-26T00:00:00Z',
    },
    {
      artifact_id: 'artifact-v2',
      version: 2,
      sha256: '2'.repeat(64),
      created_at: '2026-07-27T00:00:00Z',
    },
  ],
};

const markdownManifest: DocumentManifest = {
  artifact_id: 'artifact-v2',
  workspace_id: 'ws-docs',
  name: 'brief.md',
  version: 2,
  sha256: '2'.repeat(64),
  mime_type: 'text/markdown',
  profile: 'markdown',
  content_url: '/document/content',
  anchors: ['text-quote'],
  native_open: true,
  embedded_editors: [],
  rendition_formats: ['pdf'],
  provenance: {},
};

function review(): ArtifactReview {
  return {
    id: 'review-1',
    session_id: 'session-1',
    workspace_id: 'ws-docs',
    artifact_id: 'artifact-v2',
    artifact_name: 'brief.md',
    artifact_version: 2,
    artifact_sha256: '2'.repeat(64),
    anchor: { profile: 'text-quote', exact: 'precise result' },
    text: 'Make the evidence boundary explicit.',
    status: 'dispatched',
    native: false,
    created_at: '2026-07-27T00:00:00Z',
  };
}

function markdownBlob(): Blob {
  const blob = new Blob(['# Finding\n\nA precise result.']);
  Object.defineProperty(blob, 'text', {
    value: async () => '# Finding\n\nA precise result.',
  });
  return blob;
}

function client() {
  return {
    documentManifest: vi
      .fn<(artifactId: string) => Promise<DocumentManifest>>()
      .mockResolvedValue(markdownManifest),
    documentContent: vi.fn(async () => markdownBlob()),
    artifactReviews: vi.fn(async () => [] as ArtifactReview[]),
    submitArtifactReview: vi.fn(async () => review()),
    createDocumentRendition: vi.fn(async () => ({
      ...markdownManifest,
      artifact_id: 'artifact-pdf',
      name: 'brief.md.pdf',
      profile: 'pdf' as const,
      mime_type: 'application/pdf',
      version: 1,
    })),
    createDocumentWorkingCopy: vi.fn(),
    createDocumentEditorSession: vi.fn(),
  };
}

describe('DocumentWorkspace', () => {
  it('sanitizes static HTML into a non-executing document', () => {
    const clean = sanitizeStaticDocumentHtml(
      '<script>top.location="https://bad"</script><form action="https://bad"></form>' +
        '<link rel="stylesheet" href="https://bad/styles.css">' +
        '<style>.leak { background: url(https://bad/pixel) }</style>' +
        '<p onclick="steal()" style="background:url(https://bad/pixel)">' +
        '<a href="javascript:steal()" target="_blank">Safe text</a>' +
        '<img src="https://bad/pixel" srcset="https://bad/twice 2x"></p>',
    );

    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('<form');
    expect(clean).not.toContain('<link');
    expect(clean).not.toContain('<style');
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('javascript:');
    expect(clean).not.toContain('https://bad');
    expect(clean).not.toContain('src=');
    expect(clean).not.toContain('srcset');
    expect(clean).not.toContain('target=');
    expect(clean).toContain('Safe text');
  });

  it('blocks SVG animation and URL-valued presentation attributes', () => {
    const clean = sanitizeStaticDocumentHtml(
      '<svg><set attributeName="href" to="https://bad"></set>' +
        '<rect fill="url(https://bad/pixel)" filter="url(#local)"></rect></svg>',
    );

    expect(clean).not.toContain('<set');
    expect(clean).not.toContain('https://bad');
    expect(clean).not.toContain('fill=');
    expect(clean).not.toContain('filter=');
  });

  it('isolates retained static document styles inside a shadow root', async () => {
    render(() => (
      <DocumentTextViewer
        profile="html-static"
        sourcePath="report.html"
        html={sanitizeStaticDocumentHtml(
          '<style>body { color: red } p { font-weight: bold }</style><p>Styled report</p>',
        )}
        onSelection={() => undefined}
      />
    ));

    const host = await screen.findByTestId('document-html-static');
    expect(host.querySelector('style')).toBeNull();
    expect(host.shadowRoot?.querySelector('style')?.textContent).toContain('body');
    expect(host.shadowRoot?.textContent).toContain('Styled report');
  });

  it('opens a floating comment composer from text selection and dispatches exact identity', async () => {
    const fake = client();
    render(() => (
      <DocumentWorkspace
        artifact={artifact}
        sessionId="session-1"
        selectedPath="brief.md"
        client={fake}
      />
    ));
    await waitFor(() => expect(screen.getByText('A precise result.')).toBeTruthy());

    const paragraph = screen.getByText('A precise result.');
    const textNode = Array.from(paragraph.childNodes).find(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.includes('precise result'),
    )!;
    const exactStart = textNode.textContent!.indexOf('precise result');
    const range = document.createRange();
    range.setStart(textNode, exactStart);
    range.setEnd(textNode, exactStart + 'precise result'.length);
    Object.defineProperty(range, 'getBoundingClientRect', {
      value: () => new DOMRect(40, 60, 140, 20),
    });
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    fireEvent.mouseUp(paragraph);

    const composer = await screen.findByTestId('document-review-composer');
    expect(composer.textContent).toContain('precise result');
    const textarea = composer.querySelector('textarea')!;
    fireEvent.input(textarea, {
      target: { value: 'Make the evidence boundary explicit.' },
    });
    fireEvent.click(screen.getByText('Send to agent'));

    await waitFor(() => expect(fake.submitArtifactReview).toHaveBeenCalledTimes(1));
    expect(fake.submitArtifactReview).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        artifact_id: 'artifact-v2',
        expected_version: 2,
        expected_sha256: '2'.repeat(64),
        anchor: expect.objectContaining({
          profile: 'text-quote',
          exact: 'precise result',
        }),
      }),
    );
    expect(screen.getByTestId('document-action-status').textContent).toContain('exact revision');
  });

  it('shows immutable history and loads the selected historical version', async () => {
    const fake = client();
    fake.documentManifest.mockImplementation(async (artifactId: string) => ({
      ...markdownManifest,
      artifact_id: artifactId,
      version: artifactId === 'artifact-v1' ? 1 : 2,
      sha256: (artifactId === 'artifact-v1' ? '1' : '2').repeat(64),
    }));
    render(() => (
      <DocumentWorkspace
        artifact={artifact}
        sessionId="session-1"
        selectedPath="brief.md"
        client={fake}
      />
    ));
    fireEvent.click(await screen.findByText('History'));
    fireEvent.click(await screen.findByText('Version 1'));

    await waitFor(() => expect(fake.documentManifest).toHaveBeenCalledWith('artifact-v1'));
    expect(screen.getByTestId('document-action-status').textContent).toContain(
      'immutable version 1',
    );
  });

  it('marks a review from explicit history navigation as historical', async () => {
    const fake = client();
    fake.documentManifest.mockImplementation(async (artifactId: string) => ({
      ...markdownManifest,
      artifact_id: artifactId,
      version: artifactId === 'artifact-v1' ? 1 : 2,
      sha256: (artifactId === 'artifact-v1' ? '1' : '2').repeat(64),
    }));
    render(() => (
      <DocumentWorkspace
        artifact={artifact}
        sessionId="session-1"
        selectedPath="brief.md"
        client={fake}
      />
    ));
    fireEvent.click(await screen.findByText('History'));
    fireEvent.click(await screen.findByText('Version 1'));
    await waitFor(() => expect(screen.getByText('A precise result.')).toBeTruthy());

    const paragraph = screen.getByText('A precise result.');
    const textNode = Array.from(paragraph.childNodes).find(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.includes('precise result'),
    )!;
    const exactStart = textNode.textContent!.indexOf('precise result');
    const range = document.createRange();
    range.setStart(textNode, exactStart);
    range.setEnd(textNode, exactStart + 'precise result'.length);
    Object.defineProperty(range, 'getBoundingClientRect', {
      value: () => new DOMRect(40, 60, 140, 20),
    });
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    fireEvent.mouseUp(paragraph);
    fireEvent.input((await screen.findByTestId('document-review-composer')).querySelector('textarea')!, {
      target: { value: 'Keep this note on version one.' },
    });
    fireEvent.click(screen.getByText('Send to agent'));

    await waitFor(() =>
      expect(fake.submitArtifactReview).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({
          artifact_id: 'artifact-v1',
          expected_version: 1,
          allow_historical: true,
        }),
      ),
    );
  });

  it('lists dispatched CLIO and native comments with version status', async () => {
    const fake = client();
    fake.artifactReviews.mockResolvedValue([
      review(),
      {
        ...review(),
        id: 'review-native',
        text: '@clio revise this table',
        native: true,
        status: 'queued',
      },
    ]);
    render(() => (
      <DocumentWorkspace
        artifact={artifact}
        sessionId="session-1"
        selectedPath="brief.md"
        client={fake}
      />
    ));
    fireEvent.click(await screen.findByText(/Comments/));

    const comments = await screen.findByTestId('document-comments');
    expect(comments.textContent).toContain('CLIO comment');
    expect(comments.textContent).toContain('Native comment');
    expect(comments.textContent).toContain('@clio revise this table');
    expect(comments.textContent).toContain('dispatched');
  });
});
