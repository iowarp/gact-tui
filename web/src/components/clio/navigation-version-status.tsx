import { brand } from '@brand';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { releaseTag } from '@/lib/release-version';
import { ProductUpdateIcon, ProductUpdateSummary } from './product-update-summary';
import { useSystemVersionStatus } from '@/hooks/use-system-version-status';

export function SystemVersionStatus() {
  const {
    agentBehindLatest,
    desktopShell,
    displayedDesktopVersion,
    latestClioVersion,
    message,
    recheck,
    settings,
    state,
    statusLabel,
    updateAll,
    updating,
    versions,
  } = useSystemVersionStatus();
  return (
    <>
      <Popover
        onOpenChange={(open) => {
          if (open) void recheck();
        }}
      >
        <PopoverTrigger asChild>
          <Button
            aria-label={statusLabel}
            className="h-6 gap-1.5 px-1.5 font-mono text-[0.625rem] text-muted-foreground"
            size="xs"
            title={statusLabel}
            variant="ghost"
          >
            <ProductUpdateIcon state={state} />
            <span>{displayedDesktopVersion ? `v${displayedDesktopVersion}` : 'Version'}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-3" side="top">
          <p className="mb-4 text-sm font-semibold">Updates</p>
          <ProductUpdateSummary
            state={state}
            updating={updating}
            onCheck={recheck}
            onUpdate={desktopShell ? updateAll : undefined}
            message={message}
            versions={versions}
          >
            {!desktopShell ? (
              <div className="space-y-2 text-xs text-muted-foreground">
                <p className="break-all">Connected to {settings.endpoint}</p>
                {agentBehindLatest ? (
                  <p>
                    Install runtime updates on that computer, then reload this page.
                    {brand.agentReleaseUrl && latestClioVersion ? (
                      <>
                        {' '}
                        <ExternalLink
                          className="text-primary hover:underline"
                          href={`${brand.agentReleaseUrl}/tag/${releaseTag(latestClioVersion)}`}
                        >
                          View release
                        </ExternalLink>
                      </>
                    ) : null}
                  </p>
                ) : null}
              </div>
            ) : null}
          </ProductUpdateSummary>
        </PopoverContent>
      </Popover>
    </>
  );
}
