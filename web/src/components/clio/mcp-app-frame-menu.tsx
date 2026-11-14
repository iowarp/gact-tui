import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreIcon, RefreshIcon } from '@/lib/icon-vocabulary';
import type { PaintVerdict } from './mcp-app-first-paint';
import { MenuRow } from './primitives/menu-row';
import { ClioStatus } from './status';
import { t } from '@lingui/core/macro';

/**
 * The frame's More menu (FP-D9). "Reload view" loads the view's page again and replays
 * its opening call's input and result, the way a move between placements does; the
 * view's server keeps its state.
 */
export function McpAppFrameMenu({ label, onReload }: { label: string; onReload: () => void }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t`More actions for ${label}`}
          size="icon-sm"
          title={t`More actions`}
          type="button"
          variant="ghost"
        >
          <MoreIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuItem data-mcp-app-reload onSelect={onReload}>
          <MenuRow
            icon={<RefreshIcon />}
            label={t`Reload view`}
            description={t`Load the view again. What it shows is kept by its service.`}
          />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The header's state, in words: loading, drawing, ready, or nothing drawn. */
export function McpAppPaintStatus({ ready, paint }: { ready: boolean; paint: PaintVerdict }) {
  if (!ready) return <ClioStatus label={t`Loading`} value="running" />;
  if (paint === 'pending') return <ClioStatus label={t`Drawing`} value="running" />;
  if (paint === 'blank')
    return (
      <ClioStatus
        detail={t`The view loaded but has drawn nothing.`}
        label={t`Nothing drawn`}
        value="degraded"
      />
    );
  return <ClioStatus label={t`Ready`} value="succeeded" />;
}

/** Over a view that loaded but drew nothing: say so, and offer the reload. */
export function McpAppBlankNotice({ onReload }: { onReload: () => void }) {
  return (
    <div
      className="relative z-10 flex flex-wrap items-center gap-2 border-b bg-background px-3 py-2 text-xs text-muted-foreground"
      data-mcp-app-blank
      role="status"
    >
      <span className="min-w-0 flex-1">
        {t`The view loaded but has drawn nothing. It may need more room: reload it, or open it in a wider panel.`}
      </span>
      <Button onClick={onReload} size="sm" type="button" variant="outline">
        <RefreshIcon aria-hidden="true" />
        {t`Reload view`}
      </Button>
    </div>
  );
}
