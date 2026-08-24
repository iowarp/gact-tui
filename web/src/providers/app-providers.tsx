import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState, type PropsWithChildren } from 'react';
import { ClioMotionProvider } from '@/components/clio/motion';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ConnectionProvider } from './connection-provider';
import { AppearanceProvider } from './appearance-provider';
import { ConversationDisplayProvider } from './conversation-display-provider';

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 10_000 },
          mutations: { retry: false },
        },
      }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <ConnectionProvider>
          <AppearanceProvider>
            <ConversationDisplayProvider>
              <ClioMotionProvider>
                <TooltipProvider delayDuration={450}>{children}</TooltipProvider>
              </ClioMotionProvider>
            </ConversationDisplayProvider>
          </AppearanceProvider>
        </ConnectionProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
