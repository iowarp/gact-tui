import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { ForcedTheme } from '../../src/theme/forced-theme';
import type { RunState } from '@clio/core/v3';
import '../../src/index.css';
import { ArchiveConnectionProvider } from '../../src/providers/connection-provider';
import { RepositoryOverrideProvider } from '../../src/providers/repository-override';
import { createRepository } from '../../src/lib/connection';
import { ClioChildSessionFooter } from '../../src/components/clio/child-session-footer';
import { ChildConversationFollowup } from '../../src/components/clio/child-conversation-followup';
import { Button } from '../../src/components/ui/button';

// Manual browser review intercepts these HTTP requests. No model/service is started.
const repository = createRepository({ endpoint: location.origin });
const session = {
  id: 'review-child',
  parent_session_id: 'review-parent',
  workspace_id: 'review-ws',
};

function Review() {
  const [view, setView] = useState('central');
  const [state, setState] = useState<RunState>('completed');
  const [height, setHeight] = useState(0);
  const [returned, setReturned] = useState(false);
  return (
    <main className="flex h-dvh flex-col bg-background text-foreground">
      <header className="space-y-3 border-b p-4 text-sm">
        <p className="text-muted-foreground">
          Child follow-up fixture review. Intercepted HTTP responses; no live agent/model run.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => setView(view === 'central' ? 'panel' : 'central')}
            variant="outline"
          >
            {view === 'central' ? 'Open side panel' : 'Make central'}
          </Button>
          <label>
            Child state{' '}
            <select
              className="rounded border bg-background px-2 py-1"
              value={state}
              onChange={(event) => setState(event.target.value as RunState)}
            >
              <option value="completed">Completed</option>
              <option value="running">Running</option>
            </select>
          </label>
          {returned ? <p role="status">Parent navigation requested</p> : null}
        </div>
      </header>
      <section className="relative min-h-0 flex-1" aria-label="Child conversation review">
        <div className="h-full overflow-auto px-6 py-5" style={{ paddingBottom: height + 24 }}>
          <h1 className="text-lg font-medium">Review the supplied measurement definitions</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6">
            This is fictional child transcript text for checking composer layout and follow-up
            navigation. It does not represent an audit or scientific finding.
          </p>
        </div>
        <div className="pointer-events-none absolute inset-0 flex min-h-0 flex-col justify-end">
          {view === 'central' ? (
            <ClioChildSessionFooter
              session={session}
              parentTitle="Measurement review"
              state={state}
              onHeightChange={setHeight}
              onReturnToParent={() => setReturned(true)}
            />
          ) : (
            <aside className="pointer-events-auto ml-auto w-full max-w-md border-l bg-card">
              <h2 className="border-t p-3 text-sm font-medium">Child conversation side panel</h2>
              <ChildConversationFollowup
                sessionId={session.id}
                parentSessionId={session.parent_session_id}
                workspaceId={session.workspace_id}
              />
            </aside>
          )}
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <ArchiveConnectionProvider>
    <RepositoryOverrideProvider repository={repository}>
      <ForcedTheme
        theme={new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light'}
      >
        <Review />
      </ForcedTheme>
    </RepositoryOverrideProvider>
  </ArchiveConnectionProvider>,
);
