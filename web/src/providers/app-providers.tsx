import { SESSION_CACHE_POLICY } from '@/lib/session-cache-retention';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type PropsWithChildren } from 'react';
import { ClioMotionProvider } from '@/components/clio/motion';
import { ShortcutSheetLauncher } from '@/components/clio/primitives/shortcut-sheet';
import { TruncationHints } from '@/components/clio/primitives/truncated-text';
import { TooltipProvider } from '@/components/ui/tooltip';
import { readRetryDelayMs, retryRead } from '@/lib/connection-attempt';
import { QUERY_STALE_TIME_MS } from '@/lib/runtime-limits';
import { ConnectionProvider } from './connection-provider';
import { AppearanceProvider } from './appearance-provider';
import { ConversationDisplayProvider } from './conversation-display-provider';
import { NotificationPreferencesProvider } from './notification-preferences-provider';

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: retryRead,
            retryDelay: readRetryDelayMs,
            staleTime: QUERY_STALE_TIME_MS,
            gcTime: SESSION_CACHE_POLICY.idleMs,
          },
          mutations: { retry: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ConnectionProvider>
        <AppearanceProvider>
          <NotificationPreferencesProvider>
            <ConversationDisplayProvider>
              <ClioMotionProvider>
                <TooltipProvider delayDuration={450}>
                  {children}
                  <ShortcutSheetLauncher />
                  <TruncationHints />
                </TooltipProvider>
              </ClioMotionProvider>
            </ConversationDisplayProvider>
          </NotificationPreferencesProvider>
        </AppearanceProvider>
      </ConnectionProvider>
    </QueryClientProvider>
  );
}
