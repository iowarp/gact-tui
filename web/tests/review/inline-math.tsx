import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ForcedTheme } from '../../src/theme/forced-theme';
import { createRoot } from 'react-dom/client';
import type { Artifact, DocumentManifest } from '@clio/core/v3';
import '../../src/index.css';
import { ClioDocumentWorkspace } from '../../src/components/clio/document-workspace';
import { MarkdownFilePreview } from '../../src/components/clio/markdown-file-preview';
import { TranscriptTextBlock } from '../../src/components/clio/transcript-text-block';
import { ArchiveConnectionProvider } from '../../src/providers/connection-provider';
import { queryKeys } from '../../src/lib/query-keys';

const source =
  String.raw`# Collatz Total Stopping-Time Analysis ($1 \le n \le 1{,}000{,}000$)

The total stopping time $\sigma_{\infty}(n)$ counts the steps required to reach $1$, with $\sigma_{\infty}(1)=0$.

The longest chain starts at $n=837{,}799$ and requires $524$ steps.

$$
T(n)=\begin{cases}n/2 & n\equiv 0\pmod 2\\3n+1 & n\equiv 1\pmod 2\end{cases}
$$

Currency stays text: $20 and $30, or $20–$30.

Literal source stays code: ` + '`$n$`.';

const artifact: Artifact = {
  id: 'collatz-report',
  session_id: 'math-review',
  workspace_id: 'math-workspace',
  name: 'REPORT.md',
  media_type: 'text/markdown',
  uri: 'artifact://math-workspace/REPORT.md@v1',
};
const manifest: DocumentManifest = {
  artifact_id: artifact.id,
  workspace_id: artifact.workspace_id!,
  name: artifact.name,
  version: 1,
  sha256: 'a'.repeat(64),
  mime_type: 'text/markdown',
  profile: 'markdown',
  content_url: '/v1/artifacts/collatz-report/document/content',
  anchors: ['text-quote'],
  native_open: true,
  embedded_editors: [],
  rendition_formats: ['pdf'],
  provenance: {},
};
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
});
client.setQueryData(
  queryKeys.key('document-manifest', 'https://archive.invalid', artifact.id),
  manifest,
);
client.setQueryData(
  queryKeys.key('document-content', 'https://archive.invalid', artifact.id),
  new TextEncoder().encode(source),
);
client.setQueryData(queryKeys.key('artifact-reviews', 'https://archive.invalid', artifact.id), []);

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <ArchiveConnectionProvider>
      <ForcedTheme theme="light">
        <main className="min-h-dvh bg-background p-6 text-foreground">
          <header className="mb-6">
            <h1 className="text-xl font-medium">Inline math across views</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Seeded Collatz excerpt in the production transcript, file and artifact components. No
              model inference.
            </p>
          </header>
          <div className="grid gap-5 lg:grid-cols-3">
            <section aria-label="Transcript" className="min-w-0">
              <h2 className="mb-3 font-medium">Transcript</h2>
              <div className="h-[850px] overflow-auto rounded-lg border p-5">
                <TranscriptTextBlock
                  block={{ id: 'collatz-text', type: 'text', text: source }}
                  messageId="collatz-message"
                />
              </div>
            </section>
            <section aria-label="File" className="min-w-0">
              <h2 className="mb-3 font-medium">File preview</h2>
              <div className="h-[850px] rounded-lg border">
                <MarkdownFilePreview name="REPORT.md" content={source} />
              </div>
            </section>
            <section aria-label="Artifact" className="min-w-0">
              <h2 className="mb-3 font-medium">Artifact document</h2>
              <div className="h-[850px] rounded-lg border">
                <ClioDocumentWorkspace
                  artifact={artifact}
                  fallbackPreview={<p>Document unavailable</p>}
                />
              </div>
            </section>
          </div>
        </main>
      </ForcedTheme>
    </ArchiveConnectionProvider>
  </QueryClientProvider>,
);
