import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import type { Message } from '@clio/core/v3';
import '../../src/index.css';
import { ConnectionProvider, useConnectionSettings } from '../../src/providers/connection-provider';
import { AppearanceProvider } from '../../src/providers/appearance-provider';
import { ConversationDisplayProvider } from '../../src/providers/conversation-display-provider';
import { ClioConversation } from '../../src/components/clio/conversation';
import { ClioMotionProvider } from '../../src/components/clio/motion';
import { useRepository } from '../../src/hooks/use-repository';

function Review() {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string>();
  useEffect(() => {
    void fetch(`${settings.endpoint}/__test/session`)
      .then((response) => response.json() as Promise<{ session_id: string }>)
      .then(({ session_id }) => repository.transcript(session_id))
      .then((value) => setMessages(value.messages))
      .catch((failure: unknown) => setError(String(failure)));
  }, [repository, settings.endpoint]);
  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <p className="border-b px-5 py-3 text-xs text-muted-foreground">
        Response rating review · synthetic conversation · real GACT and isolated clio-core storage
      </p>
      {error ? <p role="alert">{error}</p> : null}
      <main className="min-h-0 flex-1">
        <ClioConversation
          messages={messages}
          tools={{}}
          tasks={{}}
          artifacts={{}}
          subagents={{}}
          surfaces={{}}
        />
      </main>
      <Toaster />
    </div>
  );
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <ConnectionProvider>
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
              <Review />
            </ConversationDisplayProvider>
          </ClioMotionProvider>
        </AppearanceProvider>
      </ThemeProvider>
    </ConnectionProvider>
  </QueryClientProvider>,
);
