import type { CapabilityVersions } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { brand } from '@brand';
import { Frame, FramePanel } from '@/components/reui/frame';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
import { useRepository } from '@/hooks/use-repository';
import { PROTOCOL } from '@/lib/brand-vocabulary';
import { queryKeys } from '@/lib/query-keys';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { useConnectionSettings } from '@/providers/connection-provider';
import { SettingsSectionHeading as SectionHeading } from './settings-section-heading';
import { MarketplaceUpdatesCheck } from './settings-marketplace-updates';

export function AboutSettings() {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const capabilities = useQuery({
    queryKey: queryKeys.key('capabilities', settings.endpoint),
    queryFn: ({ signal }) => repository.capabilities(signal),
  });
  const activeModel = capabilities.data?.active_model;
  const versions = capabilities.data?.versions;
  return (
    <div className="grid gap-6">
      <SectionHeading
        description={`Product identity comes from the active brand profile. Service versions and model identity below are reported by ${new URL(settings.endpoint).host}.`}
        title={`About ${brand.name}`}
      />
      <Frame spacing="sm">
        <FramePanel>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <AboutValue label="Product" value={brand.name} />
            <AboutValue label="Runtime" value={inTauri() ? 'Desktop application' : 'Web browser'} />
            <AboutValue label="Connected service" value={new URL(settings.endpoint).host} />
            <AboutValue
              label="Agent service version"
              value={capabilities.data?.service?.version || 'Unavailable'}
            />
            <AboutValue
              label="Active model"
              value={
                activeModel
                  ? `${activeModel.provider_id}, ${activeModel.model_id}${activeModel.effort ? `, ${activeModel.effort}` : ''}`
                  : 'Unavailable'
              }
            />
            <AboutValue
              label="Workspace protocol"
              value={capabilities.data?.gact_versions.join(', ') || 'Unavailable'}
            />
            <AboutValue
              label={`${PROTOCOL.a2ui} surfaces`}
              value={capabilities.data?.a2ui_versions.join(', ') || 'Unavailable'}
            />
            <AboutValue
              label="Backend build"
              value={
                versions?.backend_build || (capabilities.data ? 'Unreported by this service' : 'Unavailable')
              }
            />
            <AboutValue
              label="Python"
              value={versions?.python || (capabilities.data ? 'Unreported by this service' : 'Unavailable')}
            />
            <AboutValue
              label="Marketplace registry"
              value={
                !capabilities.data
                  ? 'Unavailable'
                  : !versions
                    ? 'Unreported by this service'
                    : formatMarketplaceRegistry(versions.marketplace)
              }
            />
          </dl>
          {capabilities.error ? (
            <Alert className="mt-4" variant="destructive">
              <AlertTitle>Service details unavailable</AlertTitle>
              <AlertDescription>{capabilities.error.message}</AlertDescription>
            </Alert>
          ) : null}
        </FramePanel>
      </Frame>
      <Frame spacing="sm">
        <FramePanel>
          <MarketplaceUpdatesCheck />
        </FramePanel>
      </Frame>
      {brand.homeUrl ? (
        <Button asChild className="w-fit" variant="outline">
          <ExternalLink href={brand.homeUrl}>Product website</ExternalLink>
        </Button>
      ) : null}
    </div>
  );
}

function formatMarketplaceRegistry(marketplace: CapabilityVersions['marketplace']): string {
  if (!marketplace) return 'Not configured';
  const ref = marketplace.ref || 'default ref';
  const commit = marketplace.installed_commit ? marketplace.installed_commit.slice(0, 12) : undefined;
  return commit
    ? `${marketplace.source}, ref ${ref}, installed ${commit}`
    : `${marketplace.source}, ref ${ref}, installed commit unavailable`;
}

function AboutValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words">{value}</dd>
    </div>
  );
}
