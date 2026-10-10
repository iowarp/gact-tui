import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import type { DocumentManifest } from '@clio/core/v3';
import type { DocumentApplication } from '@/tauri/documents';
import { DocumentOpenMenu } from '@/components/clio/document-open-menu';
import { HtmlPreview } from '@/components/clio/html-file-preview';
import '../../../src/index.css';

// Render the production controls with recorded native discovery. Launch acceptance is separate.
window.isTauri = true;
const inventory: Record<string, DocumentApplication[]> = await fetch('./native-apps.json').then(
  (response) => response.json(),
);
const html = await fetch('./source.html').then((response) => response.text());
const manifest: DocumentManifest = {
  artifact_id: 'review',
  workspace_id: 'review',
  name: 'raccoon.html',
  version: 1,
  sha256: '',
  mime_type: 'text/html',
  profile: 'html-static',
  content_url: '',
  native_open: true,
  embedded_editors: [],
  anchors: [],
  provenance: {},
  rendition_formats: [],
};

function Review() {
  const [file, setFile] = useState('raccoon.html');
  const [selection, setSelection] = useState('');
  return (
    <main className="flex h-screen min-h-0 flex-col bg-background text-foreground">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-2 text-xs text-muted-foreground">
        <p className="mr-auto">
          HTML preview review · Recorded OS associations; native launches tested separately
        </p>
        <select
          aria-label="Review file"
          className="bg-background text-foreground"
          value={file}
          onChange={(event) => setFile(event.target.value)}
        >
          <option value="raccoon.html">HTML</option>
          <option value="model.gltf">glTF</option>
        </select>
      </header>
      <div className="@container/viewer flex min-h-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 items-center gap-3 border-b px-3">
          <span className="mr-auto text-xs">{file}</span>
          <DocumentOpenMenu
            artifact={{
              id: 'review',
              workspace_id: 'review',
              session_id: 'review',
              name: file,
              media_type: file.endsWith('.html') ? 'text/html' : 'model/gltf+json',
              uri: 'artifact://review',
            }}
            manifest={manifest}
            applications={inventory[file] ?? []}
            pdfApplications={[]}
            openPending={false}
            pdfPending={false}
            downloadPending={false}
            hideDownload
            onOpen={(target) =>
              setSelection(
                target.kind === 'native' ? `Selected ${target.application.name}` : target.provider,
              )
            }
            onReveal={() => setSelection('Selected Open in folder')}
            onDownload={() => {}}
            onPdfDownload={() => {}}
          />
        </div>
        {selection ? (
          <p role="status" className="px-3 py-1 text-xs text-muted-foreground">
            {selection} (browser review)
          </p>
        ) : null}
        <div className="min-h-0 flex-1">
          {file.endsWith('.html') ? (
            <HtmlPreview name={file} content={html} />
          ) : (
            <p className="p-4 text-sm text-muted-foreground">
              Original glTF file · The folder action remains available without an associated app.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Review />);
