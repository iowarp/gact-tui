import { createRoot } from 'react-dom/client';
import { useRef, useReducer } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ForcedTheme } from '../../src/theme/forced-theme';
import '../../src/index.css';
import { ConnectionProvider } from '../../src/providers/connection-provider';
import { AppearanceProvider } from '../../src/providers/appearance-provider';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import { ClioMermaidDiagram } from '../../src/components/clio/mermaid-diagram';
import { PresentationNavigation } from '../../src/components/clio/presentation-navigation';
import { ClioWorkbench, type ClioWorkbenchHandle } from '../../src/components/clio/workbench';

localStorage.setItem(
  'clio.recent-connections',
  JSON.stringify([{ endpoint: location.origin, label: 'Isolated diagram review' }]),
);
const params = new URLSearchParams(location.search);
const workspaceId = params.get('workspace') || '';
const examples = [
  [
    'Workflow folders',
    'flowchart LR\n inputs[Input data] --> analysis[Analysis] --> report[Report]\n click inputs "workspace-folder:data/inputs" "Open input data"\n click analysis "workspace-folder:analysis" "Open analysis folder"\n click report "workspace-folder:reports" "Open reports folder"',
  ],
  [
    'Sequence',
    'sequenceDiagram\n actor Scientist\n participant CLIO\n participant Endpoint\n Scientist->>CLIO: Compare station observations\n CLIO->>Endpoint: Request selected interval\n Endpoint-->>CLIO: Measurements and provenance\n CLIO-->>Scientist: Evidence and chart',
  ],
  [
    'Git history',
    'gitGraph\n commit id: "Input snapshot"\n branch analysis\n checkout analysis\n commit id: "Clean measurements"\n commit id: "Validate units"\n checkout main\n merge analysis\n commit id: "Publish report"',
  ],
  [
    'Mindmap',
    'mindmap\n root((Field study))\n  Observations\n   Stations\n   Time range\n  Analysis\n   Quality checks\n   Uncertainty\n  Evidence\n   Report\n   Provenance',
  ],
  [
    'Railroad grammar',
    'railroad-ebnf-beta\n query = "SELECT" fields "FROM" source [ "WHERE" predicate ] ;\n fields = name ( "," name )* ;',
  ],
  [
    'Tall workflow',
    'flowchart TB\n a[Choose observations] --> b[Check station metadata]\n b --> c[Select time interval]\n c --> d[Read measurements]\n d --> e[Validate units]\n e --> f[Handle missing data]\n f --> g[Compute comparison]\n g --> h[Inspect uncertainty]\n h --> i[Publish evidence]',
  ],
] as const;

function Review() {
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  const workbench = useRef<ClioWorkbenchHandle>(null);
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b px-6 py-4">
        <h1 className="text-xl font-semibold">Diagrams for scientific work</h1>
        <p className="text-sm text-muted-foreground">
          Synthetic examples · production renderer · local libraries · explicit folder navigation
        </p>
        <button onClick={refresh} className="mt-2 text-sm underline">
          Refresh diagram views
        </button>
      </header>
      <main className="grid grid-cols-1 items-start gap-6 p-6 lg:grid-cols-2">
        <PresentationNavigation.Provider
          value={{
            onOpenFolder: (path) =>
              workbench.current?.open({ kind: 'workspace-folder', path, workspaceId }),
          }}
        >
          {examples.map(([title, source]) => (
            <section key={title} aria-label={title} className="min-w-0">
              <h2 className="mb-2 font-medium">{title}</h2>
              <ClioMermaidDiagram title={title} source={source} />
            </section>
          ))}
        </PresentationNavigation.Provider>
      </main>
      {workspaceId ? (
        <section className="h-96 border-t" aria-label="Real workspace files">
          <ClioWorkbench
            ref={workbench}
            workspaceId={workspaceId}
            sessionId=""
            files={[]}
            artifacts={[]}
            diffs={[]}
            onApplyDiff={() => undefined}
            onRejectDiff={() => undefined}
            onOpenSubagent={() => undefined}
            sessionView={<p>Diagram review workspace</p>}
          />
        </section>
      ) : null}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ConnectionProvider>
      <ForcedTheme theme={params.get('theme') === 'dark' ? 'dark' : 'light'}>
        <AppearanceProvider>
          <TooltipProvider>
            <Review />
          </TooltipProvider>
        </AppearanceProvider>
      </ForcedTheme>
    </ConnectionProvider>
  </QueryClientProvider>,
);
