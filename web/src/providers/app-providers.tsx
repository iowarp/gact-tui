import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { useState, type PropsWithChildren } from 'react'
import { ClioMotionProvider } from '@/components/clio/motion'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConnectionProvider } from './connection-provider'

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { retry: 1, staleTime: 10_000 },
      mutations: { retry: false },
    },
  }))

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <ConnectionProvider>
          <ClioMotionProvider>
            <TooltipProvider delayDuration={450}>{children}</TooltipProvider>
          </ClioMotionProvider>
        </ConnectionProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
