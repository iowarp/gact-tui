import type { ReactNode } from 'react';
import { useA2uiSessionRegistry } from '@/lib/a2ui/processor-store';

/**
 * Mounts the session-lifetime A2UI registry owner
 * (`web/src/hooks/use-workspace-data.ts`'s real role) around test content, so
 * a rendered `ClioA2UISurface`/`ClioPendingInteractions` — which only ever
 * CONSUME the registry (`docs/design/a2ui-compat-campaign-2026-09.md` S6
 * adversarial review, BLOCKING) — has a live advertisement to read, exactly
 * as it would inside `WorkspacePage`.
 */
export function A2uiSessionRegistryOwner({
  children,
  sessionId,
}: {
  children: ReactNode;
  sessionId: string;
}) {
  useA2uiSessionRegistry(sessionId);
  return children;
}
