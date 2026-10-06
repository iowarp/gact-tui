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
      previewName="report.pdf"
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
  expect(screen.getByRole('menuitem', { name: 'Default desktop app' })).toBeVisible();
  expect(screen.queryByRole('menuitem', { name: 'Open in PowerPoint' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('menuitem', { name: 'Open in Word' }));
  expect(onOpen).toHaveBeenCalledWith('word');
});
