import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState, type PropsWithChildren } from 'react';
import { ClioMotionProvider } from '@/components/clio/motion';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QUERY_RETRY_COUNT, QUERY_STALE_TIME_MS } from '@/lib/runtime-limits';
import { ConnectionProvider } from './connection-provider';
import { AppearanceProvider } from './appearance-provider';
import { ConversationDisplayProvider } from './conversation-display-provider';
import { NotificationPreferencesProvider } from './notification-preferences-provider';

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: QUERY_RETRY_COUNT, staleTime: QUERY_STALE_TIME_MS },
          mutations: { retry: false },
        },
      }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <ConnectionProvider>
          <AppearanceProvider>
            <NotificationPreferencesProvider>
              <ConversationDisplayProvider>
                <ClioMotionProvider>
                  <TooltipProvider delayDuration={450}>{children}</TooltipProvider>
                </ClioMotionProvider>
              </ConversationDisplayProvider>
            </NotificationPreferencesProvider>
          </AppearanceProvider>
        </ConnectionProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
