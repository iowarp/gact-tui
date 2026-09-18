import { useEffect } from 'react';
import { useDesktopTitleStore } from '@/store/desktop-title';

export interface DesktopTitleSyncInput {
  workspace?: string;
  session?: string;
  blueprint?: string;
  showsBaseAgent?: boolean;
  onOpenBlueprint?: () => void;
}

/**
 * Writes the desktop title bar's centre context (see `DesktopTitleContext`
 * and `useDesktopTitleStore`) as a route's own workspace/session/blueprint
 * data resolves. A no-op outside Tauri — the title bar itself never mounts
 * there — so callers run this unconditionally rather than behind an
 * `inTauri()` check. Clears on unmount so a stale session title never
 * survives a navigation to a route that never calls this (the title bar
 * then falls back to the product name on its own).
 */
export function useDesktopTitleSync({
  blueprint,
  onOpenBlueprint,
  session,
  showsBaseAgent,
  workspace,
}: DesktopTitleSyncInput): void {
  const setTitleContext = useDesktopTitleStore((state) => state.setTitleContext);
  const clearTitleContext = useDesktopTitleStore((state) => state.clearTitleContext);

  useEffect(() => {
    setTitleContext({ blueprint, onOpenBlueprint, session, showsBaseAgent, workspace });
    return () => clearTitleContext();
  }, [
    blueprint,
    clearTitleContext,
    onOpenBlueprint,
    session,
    setTitleContext,
    showsBaseAgent,
    workspace,
  ]);
}
