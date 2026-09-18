import { brand } from '@brand';
import { Badge } from '@/components/ui/badge';
import { useDesktopTitleStore } from '@/store/desktop-title';

export interface DesktopTitleContextProps {
  /** Toggles the maximized/restored window state — Tauri drag regions do
   * not maximize on double-click by themselves outside its own native
   * title bar, so this mirrors the OS convention explicitly. */
  onDoubleClick?: () => void;
}

/**
 * The desktop title bar's centre: `workspace › session`, with the active
 * blueprint as a small badge, read from `useDesktopTitleStore` — written by
 * the workspace route as its data resolves. Falls back to the product name
 * on any route that never calls `setTitleContext` (connection, runs,
 * infrastructure, settings).
 *
 * This is the bar's one genuinely empty area, so it carries
 * `data-tauri-drag-region`: clicking and dragging it moves the window, and
 * — per Tauri's own handling of that attribute — double-clicking it should
 * already toggle maximize/restore natively; `onDoubleClick` is a belt and
 * suspenders fallback wired to the same window action the custom
 * maximize/restore button uses, kept for platforms/WebView versions where
 * the native behavior does not fire.
 */
export function DesktopTitleContext({ onDoubleClick }: DesktopTitleContextProps) {
  const { workspace, session, blueprint } = useDesktopTitleStore((state) => state.context);
  const hasContext = Boolean(workspace || session);

  return (
    <div
      className="flex min-w-0 flex-1 items-center justify-center gap-1.5 overflow-hidden text-xs font-medium text-muted-foreground"
      data-tauri-drag-region
      data-testid="desktop-title-context"
      onDoubleClick={onDoubleClick}
    >
      {hasContext ? (
        <>
          {workspace ? <span className="truncate">{workspace}</span> : null}
          {workspace && session ? (
            <span aria-hidden="true" className="shrink-0 text-muted-foreground/70">
              ›
            </span>
          ) : null}
          {session ? <span className="truncate text-foreground">{session}</span> : null}
          {blueprint ? (
            <Badge className="shrink-0" variant="secondary">
              {blueprint}
            </Badge>
          ) : null}
        </>
      ) : (
        <span className="truncate">{brand.wordmark}</span>
      )}
    </div>
  );
}
