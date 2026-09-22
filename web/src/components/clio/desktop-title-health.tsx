import { ClioStatus, clioStatusLabel, type ClioStatusValue } from '@/components/clio/status';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useWorkspaceCapabilities } from '@/hooks/use-workspace-capabilities';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useLiveStore } from '@/store/live-store';

/**
 * Connection health for the desktop title bar's right section: a compact
 * `ClioStatus` dot driven by the live stream state (the same state
 * `WorkspaceStatusStrip` reads, so the two never disagree), with a real
 * Tooltip disclosing the endpoint, transport, and backend version — detail
 * that would be noise inline but matters the moment a connection
 * misbehaves. `ClioStatus`'s own native `title` is suppressed so it never
 * stacks a second, plainer tooltip underneath this one.
 */
export function DesktopTitleHealth() {
  const stream = useLiveStore((state) => state.entities.stream);
  const { settings } = useConnectionSettings();
  const { capabilities } = useWorkspaceCapabilities();
  const service = capabilities.data?.service;
  const transport = inTauri() ? 'Bridge' : 'Direct';
  const value: ClioStatusValue = stream;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center rounded-sm" tabIndex={0}>
          <ClioStatus
            className="border-0 bg-transparent px-0 py-0 shadow-none"
            compact
            suppressNativeTitle
            value={value}
          />
        </span>
      </TooltipTrigger>
      <TooltipContent align="end" className="max-w-none" side="bottom">
        <div className="space-y-0.5 text-left">
          <p className="font-medium">{clioStatusLabel(value)}</p>
          <p className="break-all font-mono text-[11px] text-background/70">{settings.endpoint}</p>
          <p className="text-[11px] text-background/70">Transport: {transport}</p>
          <p className="text-[11px] text-background/70">
            Backend: {service ? `${service.name} ${service.version}` : 'Unknown'}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
