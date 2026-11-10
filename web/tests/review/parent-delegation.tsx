import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Message } from '@clio/core/v3';
import { ForcedTheme } from '../../src/theme/forced-theme';
import '../../src/index.css';
import { ArchiveConnectionProvider } from '../../src/providers/connection-provider';
import { AppearanceProvider } from '../../src/providers/appearance-provider';
import { ConversationDisplayProvider } from '../../src/providers/conversation-display-provider';
import { ClioConversation } from '../../src/components/clio/conversation';
import { ClioMotionProvider } from '../../src/components/clio/motion';

// A subagent's transcript opened as a workbench tab (gact-tui#834): the parent's
// assignment carries a long path and runs past the preview, so it is bounded.
// Synthetic recorded data rendered by the production conversation components.
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const params = new URLSearchParams(window.location.search);
const assignment =
  'Independently verify the mathematics and implementation of ' +
  '/Users/jaime/Library/Application Support/ai.iowarp.clio.desktop/workspace/vaccination/analysis.py. ' +
  'User asks when highest-degree vaccination beats random and by how much. ' +
  'Check uncorrelated configuration-network SIR/bond-percolation theory against the code, ' +
  'confirm the degree-targeted threshold, re-derive the epidemic size for each strategy, ' +
  'and report every discrepancy with the line it comes from.';

const messages: Message[] = [
  {
    id: 'child-turn',
    session_id: 'child',
    role: 'assistant',
    created_at: '2026-11-09T09:42:00Z',
    completed_at: '2026-11-09T09:42:40Z',
    stop_reason: 'end_turn',
    model: { provider_id: 'claude_code', model_id: 'claude-sonnet-5.5' },
    blocks: [
      {
        id: 'assignment',
        type: 'injection',
        source: 'delegation',
        text: JSON.stringify({ assignment, parent_session_id: 'parent' }),
      },
      {
        id: 'answer',
        type: 'text',
        channel: 'answer',
        text: 'The degree-targeted threshold matches the theory; the random strategy needs 2.4× the coverage.',
      },
    ],
  },
];

function Review() {
  return (
    <div className="flex h-dvh min-w-0 bg-background text-foreground">
      <aside className="hidden min-w-0 flex-1 border-r p-5 text-xs text-muted-foreground lg:block">
        Parent conversation (not part of this fixture)
      </aside>
      <section
        aria-label="Subagent tab"
        className="flex min-h-0 min-w-0 flex-1 flex-col lg:max-w-[620px]"
      >
        <header className="shrink-0 border-b px-5 py-3 text-sm font-medium">
          Independent theory and code check
        </header>
        <div className="min-h-0 min-w-0 flex-1">
          <ClioConversation
            agentName="Independent theory and code check"
            messages={messages}
            tools={{}}
            tasks={{}}
            artifacts={{}}
            subagents={{}}
            surfaces={{}}
          />
        </div>
      </section>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <ArchiveConnectionProvider>
      <ForcedTheme theme={params.get('theme') === 'dark' ? 'dark' : 'light'}>
        <AppearanceProvider>
          <ClioMotionProvider>
            <ConversationDisplayProvider>
              <Review />
            </ConversationDisplayProvider>
          </ClioMotionProvider>
        </AppearanceProvider>
      </ForcedTheme>
    </ArchiveConnectionProvider>
  </QueryClientProvider>,
);
