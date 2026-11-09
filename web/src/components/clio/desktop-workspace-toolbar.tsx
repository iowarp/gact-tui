import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { useDesktopWorkspaceToolbar } from '@/store/desktop-workspace-toolbar';

/** Keep workspace actions in the native title bar with a safe browser/standalone fallback. */
export function DesktopWorkspaceToolbar({
  children,
  navigation,
}: {
  children: ReactNode;
  navigation: ReactNode;
}) {
  const host = useDesktopWorkspaceToolbar((state) => state.host);
  const navigationHost = useDesktopWorkspaceToolbar((state) => state.navigationHost);
  return inTauri() && host && navigationHost ? (
    <>
      {createPortal(navigation, navigationHost)}
      {createPortal(children, host)}
    </>
  ) : (
    <header
      className="flex h-12 shrink-0 items-center gap-2 border-b bg-background/90 px-3"
      data-slot="workspace-header"
    >
      {navigation}
      {children}
    </header>
  );
}
