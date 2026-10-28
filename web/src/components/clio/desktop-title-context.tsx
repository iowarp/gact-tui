import { brand } from '@brand';
import { Badge } from '@/components/ui/badge';
import { useDesktopTitleStore } from '@/store/desktop-title';

/**
 * The desktop title bar's centre: `workspace › session`, with the
 * conversation's agent as a small badge, read from `useDesktopTitleStore` — written by
 * the workspace route as its data resolves. Falls back to the product name
 * on any route that never calls `setTitleContext` (connection, runs,
 * infrastructure, settings).
 *
 * This is the bar's one genuinely empty area, so it carries
 * `data-tauri-drag-region="deep"`: clicking and dragging ANYWHERE in this
 * region — not just its own empty padding, but the workspace/session text
 * moves the window, and Tauri's drag
 * handling (src-tauri's pinned tauri crate, window/scripts/drag.js) already
 * maximizes/restores on a double-click inside a drag region natively, so
 * this needs no double-click handler of its own. The agent badge is a
 * real `<button>` (rendered via `Badge asChild`), which that same drag
 * script excludes from the drag region automatically because it is a
 * clickable tag — no explicit `data-tauri-drag-region="false"` opt-out
 * needed.
 */
export function DesktopTitleContext() {
  const { agent, onOpenAgent, session, workspace } = useDesktopTitleStore((state) => state.context);
  const hasContext = Boolean(workspace || session);

  return (
    <div
      className="flex min-w-0 flex-1 items-center justify-center gap-1.5 overflow-hidden text-xs font-medium text-muted-foreground"
      data-tauri-drag-region="deep"
      data-testid="desktop-title-context"
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
          {agent ? (
            <Badge asChild className="shrink-0" variant="secondary">
              <button onClick={onOpenAgent} title={`Open agent ${agent}`} type="button">
                {agent}
              </button>
            </Badge>
          ) : null}
        </>
      ) : (
        <span className="truncate">{brand.wordmark}</span>
      )}
    </div>
  );
}
