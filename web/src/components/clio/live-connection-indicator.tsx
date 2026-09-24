import { ClioStatus, clioStatusLabel, type ClioStatusValue } from '@/components/clio/status';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { useWorkspaceCapabilities } from '@/hooks/use-workspace-capabilities';
import { cn } from '@/lib/utils';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useLiveStore } from '@/store/live-store';

/**
 * The ONE live-connection indicator, shared by the desktop title bar and the
 * web bottom bar so the two surfaces can never disagree: both read the same
 * `entities.stream` (and `error`) off the live store. A compact `ClioStatus`
 * dot with a real HoverCard disclosing the endpoint, transport, backend
 * version, and (when the stream itself is unhappy) the live transport error
 * -- detail that would be noise inline but matters the moment a connection
 * misbehaves.
 *
 * Desktop renders this ONLY in the title bar (`DesktopTitleBar`); the web
 * bottom bar (`WorkspaceStatusStrip`) renders it too, but drops it on
 * desktop so the two surfaces never duplicate the same pill (iowarp/gact-tui
 * status-bar-truth). `ClioStatus`'s own native `title` is suppressed so it
 * never stacks a second, plainer tooltip underneath this one.
 */
export function LiveConnectionIndicator({ className }: { className?: string }) {
  const stream = useLiveStore((state) => state.entities.stream);
  const streamError = useLiveStore((state) => state.error);
  const { settings } = useConnectionSettings();
  const { capabilities } = useWorkspaceCapabilities();
  const service = capabilities.data?.service;
  const transport = inTauri() ? 'Bridge' : 'Direct';
  const value: ClioStatusValue = stream;

  return (
    <HoverCard closeDelay={100} openDelay={150}>
      <HoverCardTrigger asChild>
        <span className={cn('inline-flex items-center rounded-sm', className)} tabIndex={0}>
          <ClioStatus
            className="border-0 bg-transparent px-0 py-0 shadow-none"
            compact
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
