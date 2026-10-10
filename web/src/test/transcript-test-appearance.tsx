import type { ReactNode } from 'react';
import { AppearanceProvider } from '@/providers/appearance-provider';
import { ArchiveConnectionProvider } from '@/providers/connection-provider';

/** Render saved transcript fixtures with an explicit offline connection contract. */
export function TranscriptTestAppearance({ children }: { children: ReactNode }) {
  return (
    <ArchiveConnectionProvider>
      <AppearanceProvider>{children}</AppearanceProvider>
    </ArchiveConnectionProvider>
  );
}
