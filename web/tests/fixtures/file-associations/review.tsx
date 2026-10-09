import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import type { DocumentManifest } from '@clio/core/v3';
import type { DocumentApplication } from '@/tauri/documents';
import { DocumentOpenMenu } from '@/components/clio/document-open-menu';
import { DocumentViewControls } from '@/components/clio/document-view-controls';
import { Tabs } from '@/components/ui/tabs';
import '../../../src/index.css';

// Test-only host flag: menu selections are recorded here and never launch programs.
window.isTauri = true;
const inventory: Record<string, DocumentApplication[]> = await fetch('./native-apps.json').then(
  (response) => response.json(),
);
function Review() {
  const [extension, setExtension] = useState('md');
  const [view, setView] = useState('preview');
  const [selection, setSelection] = useState('');
  const profile = ({ md: 'markdown', html: 'html-static', pdf: 'pdf', png: 'binary' } as const)[
    extension as 'md' | 'html' | 'pdf' | 'png'
  ];
  const name = `investigation.${extension}`;
  const manifest: DocumentManifest = {
    artifact_id: 'test',
    workspace_id: 'test',
    name,
    version: 1,
    sha256: '',
    mime_type: '',
    profile,
    content_url: '',
    native_open: true,
    embedded_editors: [],
    anchors: [],
    provenance: {},
    rendition_formats: ['markdown', 'html-static'].includes(profile) ? ['pdf'] : [],
  };
  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-lg font-semibold">File association menu review</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Real Windows association inventory; browser fixture. Selections do not launch apps.
      </p>
      <label className="mt-6 flex items-center gap-3 text-sm">
        File format
        <select
          value={extension}
          onChange={(event) => setExtension(event.target.value)}
          className="rounded border p-1"
        >
          <option value="md">Markdown</option>
          <option value="html">HTML</option>
          <option value="pdf">PDF</option>
          <option value="png">PNG</option>
        </select>
      </label>
      <section className="@container/viewer mt-6 rounded-lg border">
        <Tabs value={view} onValueChange={setView}>
          <div className="flex items-center gap-2 border-b px-4 py-2">
            <span className="mr-auto text-sm font-medium">{name}</span>
            <DocumentViewControls
              value={view}
              onChange={setView}
              reviewCount={0}
              markdown={profile === 'markdown'}
              html={profile === 'html-static'}
            />
            <DocumentOpenMenu
              artifact={{
                id: 'test',
                workspace_id: 'test',
                session_id: 'test',
                name,
                media_type: '',
                uri: 'test',
              }}
              manifest={manifest}
              applications={inventory[`file.${extension}`] ?? []}
              pdfApplications={inventory['file.pdf'] ?? []}
              openPending={false}
              pdfPending={false}
              downloadPending={false}
              hideDownload
              onOpen={(target) =>
                setSelection(
                  target.kind === 'native'
                    ? `${target.format} → ${target.application.name}`
                    : target.provider,
                )
              }
              onDownload={() => setSelection('Download original')}
              onPdfDownload={() => setSelection('Download PDF')}
            />
          </div>
          <div className="min-h-72 space-y-4 p-6">
            <h2 className="text-xl font-semibold">Investigation notes</h2>
            <p>Preview and Source are views inside the file viewer.</p>
            <p>
              Open in uses apps associated with the original file. PDF apps appear in a separate
              section.
            </p>
            <p className="text-sm text-muted-foreground" role="status">
              {selection || `Current view: ${view}`}
            </p>
          </div>
        </Tabs>
      </section>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Review />);
