import { ClioStatus, clioStatusLabel, type ClioStatusValue } from '@/components/clio/status';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { useConnectionIndicatorState } from '@/hooks/use-connection-indicator-state';
import { useWorkspaceCapabilities } from '@/hooks/use-workspace-capabilities';
import { cn } from '@/lib/utils';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useLiveStore } from '@/store/live-store';

/**
 * The ONE live-connection indicator, shared by the desktop title bar and the
 * web bottom bar so the two surfaces can never disagree: both read
 * `useConnectionIndicatorState` -- the open session stream where one exists,
 * the service probe on every other route (Settings has no session stream). A `ClioStatus` badge --
 * icon PLUS its short text label ("Live", "Reconnecting", ...), never the
 * icon alone (gact-tui rule: status is never encoded only as a dot, color, or
 * unexplained icon) -- with a real HoverCard disclosing the endpoint,
 * transport, backend version, and (when the stream itself is unhappy) the
 * live transport error.
 *
 * Desktop renders this ONLY in the title bar (`DesktopTitleBar`); the web
 * bottom bar (`WorkspaceStatusStrip`) renders it too, but drops it on
 * desktop so the two surfaces never duplicate the same pill (iowarp/gact-tui
 * status-bar-truth). `ClioStatus`'s own native `title` is suppressed so it
 * never stacks a second, plainer tooltip underneath this one.
 */
export function LiveConnectionIndicator({ className }: { className?: string }) {
  const stream = useConnectionIndicatorState();
  const streamOwned = useLiveStore((state) => state.streamOwners > 0);
  const streamError = useLiveStore((state) => (streamOwned ? state.error : undefined));
  const { settings } = useConnectionSettings();
  const { capabilities } = useWorkspaceCapabilities();
  const service = capabilities.data?.service;
  const transport = inTauri() ? 'Bridge' : 'Direct';
  const value: ClioStatusValue = stream;

  return (
    <HoverCard closeDelay={100} openDelay={150}>
      <HoverCardTrigger asChild>
        {/* A flex item that centers itself: the desktop title bar's control
            group stretches its children to the bar height (for the window
            buttons), which would otherwise top-align this inline chip. */}
        <span
          aria-label={clioStatusLabel(value)}
          className="inline-flex items-center self-center"
          role="status"
          tabIndex={0}
        >
          <ClioStatus
            className={cn('h-6 gap-1 border-0 bg-transparent px-1 py-0 text-[10px]', className)}
            suppressNativeTitle
            value={value}
          />
        </span>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="w-72 text-left" side="bottom">
        <div className="space-y-1">
          <p className="font-medium">{clioStatusLabel(value)}</p>
          <p className="break-all font-mono text-[11px] text-muted-foreground">
            {settings.endpoint}
          </p>
          <p className="text-[11px] text-muted-foreground">Transport: {transport}</p>
          <p className="text-[11px] text-muted-foreground">
            Backend: {service ? `${service.name} ${service.version}` : 'Unknown'}
          </p>
          {streamError ? <p className="text-[11px] text-destructive">{streamError}</p> : null}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
