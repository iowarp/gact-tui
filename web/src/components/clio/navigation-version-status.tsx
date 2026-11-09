import { brand } from '@brand';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { releaseTag } from '@/lib/release-version';
import { agentIdentity } from './connection-names';
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
        <PopoverContent
          align="start"
          className="w-80 p-3"
          onOpenAutoFocus={(event) => {
            // Focus the panel so the icon-only check does not open its hover name.
            event.preventDefault();
            (event.target as HTMLElement | null)?.focus();
          }}
          side="top"
        >
          <p className="text-sm font-semibold">Updates</p>
          <ProductUpdateSummary
            state={state}
            updating={updating}
            onCheck={recheck}
            onUpdate={desktopShell ? updateAll : undefined}
            message={message}
            versions={versions}
            facts={
              desktopShell
                ? []
                : [
                    {
                      label: 'Address',
                      value: agentIdentity(settings.endpoint).address,
                      testId: 'version-row-address',
                    },
                  ]
            }
          >
            {!desktopShell && agentBehindLatest ? (
              <p className="text-xs text-muted-foreground">
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
          </ProductUpdateSummary>
        </PopoverContent>
      </Popover>
    </>
  );
}
