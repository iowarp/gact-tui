import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { DocumentOpenMenu } from './document-open-menu';

vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => true }));
afterEach(cleanup);

it('offers installed Word for a Word file and preserves the default app choice', async () => {
  const onOpen = vi.fn();
  render(
    <DocumentOpenMenu
      artifact={{
        id: 'art_1',
        workspace_id: 'ws_1',
        session_id: 'sess_1',
        name: 'report.docx',
        media_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        uri: 'artifact://report.docx',
      }}
      manifest={{
        artifact_id: 'art_1',
        workspace_id: 'ws_1',
        name: 'report.docx',
        version: 1,
        sha256: 'a'.repeat(64),
        mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        profile: 'ooxml-word',
        content_url: '',
        native_open: true,
        embedded_editors: [],
        anchors: [],
        rendition_formats: ['pdf'],
        provenance: {},
      }}
      hasPdf
      applications={['word', 'powerpoint']}
      openPending={false}
      pdfPending={false}
      downloadPending={false}
      onOpen={onOpen}
      onPdf={vi.fn()}
      onDownload={vi.fn()}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Open in' }));
  expect(screen.getByRole('menuitem', { name: 'Default document app' })).toBeVisible();
  expect(screen.queryByRole('menuitem', { name: 'Open in PowerPoint' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('menuitem', { name: 'Open in Word' }));
  expect(onOpen).toHaveBeenCalledWith('word');
});

it('gives HTML its preview, source and native targets without PDF or Office actions', async () => {
  const onPreview = vi.fn();
  const onSource = vi.fn();
  const onOpen = vi.fn();
  render(
    <DocumentOpenMenu
      artifact={{
        id: 'html',
        workspace_id: 'ws',
        session_id: 's',
        name: 'cat.HTML',
        media_type: 'text/html',
        uri: 'artifact://cat',
      }}
      manifest={{
        artifact_id: 'html',
        workspace_id: 'ws',
        name: 'cat.HTML',
        version: 1,
        sha256: 'a'.repeat(64),
        mime_type: 'text/html',
        profile: 'html-static',
        content_url: '',
        native_open: true,
        embedded_editors: ['onlyoffice'],
        anchors: [],
        rendition_formats: ['pdf'],
        provenance: {},
      }}
      hasPdf
      applications={['word', 'powerpoint', 'excel']}
      editorHealth={{
        editors: [{ provider: 'onlyoffice', url: '', configured: true, healthy: true }],
      }}
      openPending={false}
      pdfPending={false}
      downloadPending={false}
      hideDownload
      onPreview={onPreview}
      onSource={onSource}
      onOpen={onOpen}
      onPdf={vi.fn()}
      onDownload={vi.fn()}
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Open in' }));
  expect(screen.queryByRole('menuitem', { name: 'PDF preview' })).not.toBeInTheDocument();
  expect(
    screen.queryByRole('menuitem', { name: /Word|PowerPoint|Excel|ONLYOFFICE/u }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Default HTML app' })).toBeVisible();
  await user.click(screen.getByRole('menuitem', { name: 'HTML source' }));
  expect(onSource).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: 'Open in' }));
  await user.click(screen.getByRole('menuitem', { name: 'HTML preview' }));
  expect(onPreview).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: 'Open in' }));
  await user.click(screen.getByRole('menuitem', { name: 'Default HTML app' }));
  expect(onOpen).toHaveBeenCalledWith('native');
});

it.each([
  ['slides.pptx', 'ooxml-slides', 'Default presentation app', 'PowerPoint'],
  ['table.xlsx', 'ooxml-sheet', 'Default spreadsheet app', 'Excel'],
  ['paper.pdf', 'pdf', 'Default PDF viewer', undefined],
  ['notes.md', 'markdown', 'Default text editor', undefined],
  ['article.tex', 'latex', 'Default text editor', undefined],
  ['report.odt', 'odf-text', 'Default document app', 'Word'],
  ['table.ods', 'odf-sheet', 'Default spreadsheet app', 'Excel'],
  ['slides.odp', 'odf-slides', 'Default presentation app', 'PowerPoint'],
  ['picture.png', 'binary', 'Default image viewer', undefined],
  ['sound.wav', 'binary', 'Default audio player', undefined],
  ['clip.mp4', 'binary', 'Default video player', undefined],
  ['data.csv', 'binary', 'Default spreadsheet app', 'Excel'],
  ['data.json', 'binary', 'Default JSON app', undefined],
  ['script.py', 'binary', 'Default Python app', undefined],
  ['output.zip', 'binary', 'Default archive app', undefined],
  ['mesh.glb', 'binary', 'Default 3D app', undefined],
  ['output.unknown', 'binary', 'Default desktop app', undefined],
] as const)('keeps Open in choices specific to %s', async (name, profile, label, application) => {
  render(
    <DocumentOpenMenu
      artifact={{
        id: 'doc',
        workspace_id: 'ws',
        session_id: 's',
        name,
        media_type: '',
        uri: 'artifact://doc',
      }}
      manifest={{
        artifact_id: 'doc',
        workspace_id: 'ws',
        name,
        version: 1,
        sha256: 'a'.repeat(64),
        mime_type: '',
        profile,
        content_url: '',
        native_open: true,
        embedded_editors: ['onlyoffice', 'collabora'],
        anchors: [],
        rendition_formats: ['pdf'],
        provenance: {},
      }}
      hasPdf={profile === 'pdf'}
      applications={['word', 'powerpoint', 'excel']}
      editorHealth={{
        editors: [
          { provider: 'onlyoffice', url: '', configured: true, healthy: true },
          { provider: 'collabora', url: '', configured: true, healthy: false },
        ],
      }}
      openPending={false}
      pdfPending={false}
      downloadPending={false}
      onOpen={vi.fn()}
      onPdf={vi.fn()}
      onDownload={vi.fn()}
      onPreview={vi.fn()}
      onSource={vi.fn()}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Open in' }));
  expect(screen.getByRole('menuitem', { name: label })).toBeVisible();
  for (const app of ['Word', 'PowerPoint', 'Excel']) {
    expect(screen.queryByRole('menuitem', { name: `Open in ${app}` }) !== null).toBe(
      app === application,
    );
  }
  expect(screen.queryByRole('menuitem', { name: 'PDF preview' }) !== null).toBe(
    profile !== 'binary',
  );
  const office = profile.startsWith('ooxml-') || profile.startsWith('odf-');
  expect(screen.queryByRole('menuitem', { name: 'ONLYOFFICE' }) !== null).toBe(office);
  if (office)
    expect(screen.getByRole('menuitem', { name: /Collabora/u })).toHaveAttribute('data-disabled');
  expect(screen.queryByRole('menuitem', { name: 'Markdown source' }) !== null).toBe(
    profile === 'markdown',
  );
  expect(screen.queryByRole('menuitem', { name: 'LaTeX source' }) !== null).toBe(
    profile === 'latex',
  );
});
