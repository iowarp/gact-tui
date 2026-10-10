import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import type { Message, ToolInvocation } from '@clio/core/v3';
import '../../src/index.css';
import { ArchiveConnectionProvider } from '../../src/providers/connection-provider';
import { AppearanceProvider } from '../../src/providers/appearance-provider';
import { ConversationDisplayProvider } from '../../src/providers/conversation-display-provider';
import { ClioConversation } from '../../src/components/clio/conversation';
import { ClioMotionProvider } from '../../src/components/clio/motion';

interface RecordedExcerpt {
  messages: Message[];
  tools: Record<string, ToolInvocation>;
}

function Replay() {
  const [excerpt, setExcerpt] = useState<RecordedExcerpt>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    void fetch('/__test/transcript-text-flow')
      .then((response) => {
        if (!response.ok) throw new Error('A recorded transcript excerpt is required.');
        return response.json() as Promise<RecordedExcerpt>;
      })
      .then(setExcerpt)
      .catch((failure: unknown) => setError(String(failure)));
  }, []);
  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="border-b px-5 py-3 text-xs text-muted-foreground">
        Recorded conversation excerpt · current renderer · historical timings and failures
      </header>
      <main className="min-h-0 min-w-0 flex-1">
        {error ? <p role="alert">{error}</p> : null}
        {excerpt ? (
          <ClioConversation
            messages={excerpt.messages}
            tools={excerpt.tools}
            tasks={{}}
            artifacts={{}}
            subagents={{}}
            surfaces={{}}
          />
        ) : null}
      </main>
    </div>
  );
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <ArchiveConnectionProvider>
      <ThemeProvider
        attribute="class"
        forcedTheme={
          new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light'
        }
        enableSystem={false}
      >
        <AppearanceProvider>
          <ClioMotionProvider>
            <ConversationDisplayProvider>
              <Replay />
            </ConversationDisplayProvider>
          </ClioMotionProvider>
        </AppearanceProvider>
      </ThemeProvider>
    </ArchiveConnectionProvider>
  </QueryClientProvider>,
);
