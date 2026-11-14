import { isNestedToolInvocation, type SubagentRun, type ToolInvocation } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import '../../src/index.css';
import { AppearanceProvider } from '../../src/providers/appearance-provider';
import { ConnectionProvider } from '../../src/providers/connection-provider';
import { PresentationNavigation } from '../../src/components/clio/presentation-navigation';
import { ClioToolInvocation } from '../../src/components/clio/tool-invocation';
import { Button } from '../../src/components/ui/button';
import { TooltipProvider } from '../../src/components/ui/tooltip';

const fixture: { tools: ToolInvocation[]; subagents: Record<string, SubagentRun> } = await (
  await fetch('/__test/operation-tools')
).json();
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const tools = Object.fromEntries(fixture.tools.map((tool) => [tool.id, tool]));
// A script's calls show nested under its row, not again at the top level.
const topLevel = fixture.tools.filter((tool) => !isNestedToolInvocation(tool, tools));

export function Review() {
  const [all, setAll] = useState(false);
  const [opened, setOpened] = useState('');
  return (
    <PresentationNavigation.Provider
      value={{
        artifacts: {},
        subagents: fixture.subagents,
        tools,
        workspaceId: 'ws_review',
        onOpenFile: setOpened,
        onOpenFlow: (handle) => setOpened(handle),
        onOpenSubagent: (child) => setOpened(child.child_session_id || child.id),
      }}
    >
      <main className="mx-auto max-w-3xl p-5">
        <h1 className="mb-2 text-lg font-semibold">Tool operation review</h1>
        <p className="mb-5 text-sm text-muted-foreground">
          Synthetic inputs and results rendered by the production chat components.
        </p>
        <div className="mb-4 flex gap-3">
          <Button variant="outline" onClick={() => setAll(!all)}>
            {all ? 'Collapse all' : 'Expand all'}
          </Button>
          <span className="self-center text-sm text-muted-foreground">
            {topLevel.length} tools
          </span>
        </div>
        <div className="border-l pl-3">
          {topLevel.map((tool) => (
            <ClioToolInvocation key={`${tool.id}-${all}`} tool={tool} compact defaultOpen={all} />
          ))}
        </div>
        {opened ? (
          <aside role="region" aria-label="Opened entity" className="mt-5 border-t p-3 text-sm">
            {opened}
          </aside>
        ) : null}
      </main>
    </PresentationNavigation.Provider>
  );
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <MemoryRouter>
      <ConnectionProvider>
        <AppearanceProvider>
          <TooltipProvider delayDuration={450}>
            <Review />
          </TooltipProvider>
        </AppearanceProvider>
      </ConnectionProvider>
    </MemoryRouter>
  </QueryClientProvider>,
);
