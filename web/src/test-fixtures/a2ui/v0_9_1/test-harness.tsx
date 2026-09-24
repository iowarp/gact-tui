import type { ReactNode } from 'react';
import { useA2uiSessionRegistry } from '@/lib/a2ui/processor-store';

/**
 * Mounts the session-lifetime A2UI registry owner
 * (`web/src/hooks/use-workspace-data.ts`'s real role) around test content, so
 * a rendered `ClioA2UISurface`/`ClioPendingInteractions` — which only ever
 * CONSUME the registry (`docs/design/a2ui-compat-campaign-2026-09.md` S6
 * adversarial review, BLOCKING) — has a live advertisement to read, exactly
 * as it would inside `WorkspacePage`. `sessionId` accepts one id or several —
 * the real owner now covers every session a mounted surface can reference
 * (S1 item A2), not only the "open" one.
 */
export function A2uiSessionRegistryOwner({
  children,
  sessionId,
}: {
  children: ReactNode;
  sessionId: string | readonly string[];
}) {
  useA2uiSessionRegistry(Array.isArray(sessionId) ? sessionId : [sessionId]);
  return children;
}
