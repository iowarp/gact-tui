import type { Artifact, DocumentManifest } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { DocumentOpenMenu } from './document-open-menu';
import { vocab } from '@/lib/brand-vocabulary';
const host = vi.hoisted(() => ({ native: true }));
vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => host.native }));
afterEach(() => {
  cleanup();
  host.native = true;
});
const artifact: Artifact = {
  id: 'art',
  workspace_id: 'ws',
  session_id: 'sess',
  name: 'report.md',
  media_type: 'text/markdown',
  uri: 'artifact://report.md',
};
const manifest: DocumentManifest = {
  artifact_id: 'art',
  workspace_id: 'ws',
  name: 'report.md',
  version: 1,
  sha256: 'a'.repeat(64),
  mime_type: 'text/markdown',
  profile: 'markdown',
  content_url: '',
  native_open: true,
  embedded_editors: [],
  anchors: [],
  rendition_formats: ['pdf'],
  provenance: {},
};
const editor = { id: 'os-editor', name: 'Visual Studio Code', is_default: true };
const viewer = { id: 'os-pdf-app', name: 'Adobe Acrobat', is_default: false };
function menu(profile: DocumentManifest['profile'] = 'markdown', overrides = {}) {
  const onOpen = vi.fn(),
    onPdfDownload = vi.fn(),
    onDownload = vi.fn();
  render(
    <DocumentOpenMenu
      artifact={artifact}
      manifest={{ ...manifest, profile }}
      applications={[editor]}
      pdfApplications={[viewer]}
      openPending={false}
      pdfPending={false}
      downloadPending={false}
      onOpen={onOpen}
      onPdfDownload={onPdfDownload}
      onDownload={onDownload}
      {...overrides}
    />,
  );
  return { onOpen, onPdfDownload, onDownload };
}
it('shows real handlers and separates the PDF apps from the original apps', async () => {
  const { onOpen } = menu();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Open in' }));
  expect(screen.getByRole('menuitem', { name: 'Visual Studio Code (default)' })).toBeVisible();
  expect(screen.getByText('PDF')).toBeVisible();
  expect(screen.queryByText(/Markdown preview|Markdown source|PDF preview|Copy path/u)).toBeNull();
  await user.click(screen.getByRole('menuitem', { name: 'Adobe Acrobat' }));
  expect(onOpen).toHaveBeenCalledWith({ kind: 'native', application: viewer, format: 'pdf' });
  await user.click(screen.getByRole('button', { name: 'Open in' }));
  await user.click(screen.getByRole('menuitem', { name: 'Visual Studio Code (default)' }));
  expect(onOpen).toHaveBeenLastCalledWith({
    kind: 'native',
    application: editor,
    format: 'original',
  });
});
it.each([
  'html-static',
  'markdown',
  'latex',
  'pdf',
  'ooxml-word',
  'odf-text',
  'ooxml-sheet',
  'odf-sheet',
  'ooxml-slides',
  'odf-slides',
  'binary',
] as const)('uses OS handlers for %s instead of guessed Office apps', async (profile) => {
  menu(profile);
  await userEvent.click(screen.getByRole('button', { name: 'Open in' }));
  expect(screen.getByRole('menuitem', { name: 'Visual Studio Code (default)' })).toBeVisible();
  expect(
    screen.queryByRole('menuitem', { name: /Word|Excel|PowerPoint|Default .* app/u }),
  ).toBeNull();
  expect(screen.queryByRole('menuitem', { name: 'Adobe Acrobat' }) !== null).toBe(
    profile !== 'pdf',
  );
});
it('does not duplicate a PDF conversion section for an original PDF', async () => {
  menu('pdf', { artifact: { ...artifact, name: 'report.pdf', media_type: 'application/pdf' } });
  await userEvent.click(screen.getByRole('button', { name: 'Open in' }));
  expect(screen.getAllByText('PDF')).toHaveLength(1);
  expect(screen.queryByRole('menuitem', { name: 'Download PDF' })).toBeNull();
});
it('does not show an empty Export menu when the PDF already has a shared download action', () => {
  host.native = false;
  menu('pdf', { hideDownload: true });
  expect(screen.queryByRole('button')).toBeNull();
});
it('offers downloads in the web host without pretending to enumerate native apps', async () => {
  host.native = false;
  const { onPdfDownload, onDownload } = menu();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Export' }));
  expect(screen.queryByText(/Visual Studio Code|Adobe Acrobat|Copy path/u)).toBeNull();
  await user.click(screen.getByRole('menuitem', { name: 'Download PDF' }));
  expect(onPdfDownload).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: 'Export' }));
  await user.click(screen.getByRole('menuitem', { name: 'Download original' }));
  expect(onDownload).toHaveBeenCalledOnce();
});
it('shows empty, failed, and pending association queries explicitly', async () => {
  menu('markdown', { applications: [], pdfApplications: [], pdfApplicationsPending: true });
  await userEvent.click(screen.getByRole('button', { name: 'Open in' }));
  expect(screen.getByRole('menuitem', { name: 'No associated apps' })).toHaveAttribute(
    'data-disabled',
  );
  expect(screen.getByRole('menuitem', { name: 'Finding apps…' })).toHaveAttribute('data-disabled');
});
it('keeps configured embedded editors specific to office formats', async () => {
  menu('ooxml-word', {
    manifest: { ...manifest, profile: 'ooxml-word', embedded_editors: ['onlyoffice', 'collabora'] },
    editorHealth: {
      editors: [
        { provider: 'onlyoffice', configured: true, healthy: true, url: '' },
        { provider: 'collabora', configured: true, healthy: false, url: '', error: 'offline' },
      ],
    },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Open in' }));
  expect(screen.getByRole('menuitem', { name: `ONLYOFFICE (in ${vocab.agent})` })).toBeVisible();
  expect(
    screen.getByRole('menuitem', { name: `Collabora (in ${vocab.agent}) — unavailable` }),
  ).toHaveAttribute('data-disabled');
});
