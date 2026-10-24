import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ForcedTheme } from '../../src/theme/forced-theme';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ClioRepository, type SessionReviewSnapshot } from '@clio/core/v3';
import '../../src/index.css';
import { ArchiveConnectionProvider } from '../../src/providers/connection-provider';
import { AppearanceProvider } from '../../src/providers/appearance-provider';
import { RepositoryOverrideProvider } from '../../src/providers/repository-override';
import { ArchiveTransport } from '../../src/lib/session-export/archive-transport';
import { GroundedMessageResponse } from '../../src/components/clio/grounded-message-response';
import { PresentationNavigation } from '../../src/components/clio/presentation-navigation';
import { ClioWorkbench, type ClioWorkbenchOpenRequest } from '../../src/components/clio/workbench';
import protocol from './fixtures/citations/protocol.md?raw';
import measurements from './fixtures/citations/measurements.csv?raw';

const workspaceId = 'citation-review';
const texts = { '/review/protocol notes.md': protocol, '/review/measurements.csv': measurements };
const snapshot: SessionReviewSnapshot = {
  responses: Object.fromEntries(
    Object.entries(texts).map(([path, content]) => [
      `GET /v1/workspaces/${workspaceId}/files/read?path=${encodeURIComponent(path)}`,
      { bytes: btoa(content), status: 200 },
    ]),
  ),
  sessions: {},
  tables: {},
  failures: [],
};
const repository = new ClioRepository(new ArchiveTransport(snapshot));
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Review() {
  const route = useLocation();
  const [request, setRequest] = useState<{ key: string; request: ClioWorkbenchOpenRequest }>();
  const open = (path: string) =>
    setRequest({ key: `${path}:${Date.now()}`, request: { kind: 'workspace-file', path } });
  return (
    <main className="flex h-dvh flex-col bg-background text-foreground">
      <header className="border-b p-4 text-sm text-muted-foreground">
        Citation interaction review: fictional records and real fixture files, no model or OPAL run.
        <output className="sr-only" aria-label="Current review route">
          {route.pathname + route.hash}
        </output>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
        <section className="overflow-auto p-8">
          <PresentationNavigation.Provider
            value={{ artifacts: {}, subagents: {}, onOpenFile: open }}
          >
            <GroundedMessageResponse mode="static">
              {'The protocol describes projected area in pixels. Calibration is still needed before reporting square millimetres. [Measurement protocol](workspace-file:/review/protocol%20notes.md)\n\n' +
                'I counted three plant measurements in the supplied table. [Measurements](workspace-file:/review/measurements.csv)\n\n' +
                'The audit is still running; I have not used it to support these findings.\n\n' +
                'Unavailable reference: [Missing report](artifact://artifact_missing).\n\n' +
                'External link: [Documentation](https://example.com).\n\n' +
                'The same protocol can be cited by number. [1](workspace-file:/review/protocol%20notes.md)\n\n' +
                'Sources:\n1. [Protocol](workspace-file:/review/protocol%20notes.md)\n2. [Documentation](https://example.com)\n\n' +
                'Inline math: $$x^2$$. A display equation:\n\n$$\n\\bar{x} = \\frac{1}{n}\\sum_{i=1}^{n} x_i\n$$\n\n' +
                '[This conversation](session://citation-review/citation-session) and [review note](#review-note).'}
            </GroundedMessageResponse>
            <p id="review-note" className="mt-4 text-sm text-muted-foreground">
              This note is an existing document anchor.
            </p>
          </PresentationNavigation.Provider>
        </section>
        <aside className="min-h-0 border-l" aria-label="Source file panel">
          <ClioWorkbench
            workspaceId={workspaceId}
            sessionId="citation-session"
            files={Object.entries(texts).map(([path, content]) => ({
              path,
              type: 'file' as const,
              internal: false,
              size: content.length,
            }))}
            artifacts={[]}
            diffs={[]}
            sessionView={<p className="p-5">Open a cited source to inspect it here.</p>}
            requestedOpen={request}
            onOpenSubagent={() => undefined}
            onApplyDiff={async () => undefined}
            onRejectDiff={async () => undefined}
          />
        </aside>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <ArchiveConnectionProvider>
      <RepositoryOverrideProvider repository={repository}>
        <ForcedTheme
          theme={new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light'}
        >
          <AppearanceProvider>
            <MemoryRouter
              initialEntries={['/workspaces/citation-review/sessions/citation-session']}
            >
              <Review />
            </MemoryRouter>
          </AppearanceProvider>
        </ForcedTheme>
      </RepositoryOverrideProvider>
    </ArchiveConnectionProvider>
  </QueryClientProvider>,
);
