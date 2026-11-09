import type { CapabilityVersions } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { brand } from '@brand';
import { ExternalLinkIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
import { useRepository } from '@/hooks/use-repository';
import { PROTOCOL } from '@/lib/brand-vocabulary';
import { queryKeys } from '@/lib/query-keys';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { cn } from '@/lib/utils';
import { useConnectionSettings } from '@/providers/connection-provider';
import { TechnicalDetails } from './technical-details';
import { StateView } from './primitives/state-view';
import { SettingsGroupLabel, SettingsRow } from './settings-row';
import { SettingsSectionHeading } from './settings-section-heading';

/** Version and links: this app, then the connected service; wire detail stays behind a disclosure. */
export function AboutSettings() {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const capabilities = useQuery({
    queryKey: queryKeys.key('capabilities', settings.endpoint),
    queryFn: ({ signal }) => repository.capabilities(signal),
  });
  const data = capabilities.data;
  const activeModel = data?.active_model;
  const versions = data?.versions;
  const missing = capabilities.isPending ? 'Loading…' : 'Unavailable';
  return (
    <div>
      <SettingsSectionHeading description="Version and links." title={`About ${brand.name}`} />
      <SettingsGroupLabel className="mt-0">This app</SettingsGroupLabel>
      <AboutValue label="Product" value={brand.name} />
      <AboutValue label="Runtime" value={inTauri() ? 'Desktop application' : 'Web browser'} />
      {brand.homeUrl ? (
        <SettingsRow title="Website">
          <Button asChild className="shrink-0" size="sm" variant="outline">
            <ExternalLink href={brand.homeUrl}>
              Product website
              <ExternalLinkIcon aria-hidden="true" />
            </ExternalLink>
          </Button>
        </SettingsRow>
      ) : null}
      <SettingsGroupLabel>Connected service</SettingsGroupLabel>
      {capabilities.error ? (
        <div className="w-full border-b border-border/70 py-1">
          <StateView
            action={{ label: 'Retry', onClick: () => void capabilities.refetch() }}
            kind="error"
            size="row"
            title="Service details could not be loaded."
          />
        </div>
      ) : (
        <>
          {!data || data.service?.version ? (
            <AboutValue
              label="Agent service version"
              mono
              value={data?.service?.version || missing}
            />
          ) : null}
          {/* Rows the service does not report are left out rather than filled with a placeholder. */}
          {!data || versions?.backend_build ? (
            <AboutValue label="Backend build" mono value={versions?.backend_build || missing} />
          ) : null}
          {!data || versions?.python ? (
            <AboutValue label="Python" mono value={versions?.python || missing} />
          ) : null}
          {!data || versions ? (
            <AboutValue
              label="Marketplace registry"
              mono
              value={versions ? formatMarketplaceRegistry(versions.marketplace) : missing}
            />
          ) : null}
          <div className="w-full py-2">
            <TechnicalDetails
              contentClassName="pt-1"
              summaryClassName="text-xs font-normal"
              title="Technical details"
            >
              <AboutValue label="Address" mono value={endpointHost(settings.endpoint)} />
              <AboutValue
                label="Active model"
                mono
                value={
                  activeModel
                    ? `${activeModel.provider_id}/${activeModel.model_id}${activeModel.effort ? `, ${activeModel.effort}` : ''}`
                    : missing
                }
              />
              <AboutValue
                label="Workspace protocol"
                mono
                value={data?.gact_versions.join(', ') || missing}
              />
              <AboutValue
                label={`${PROTOCOL.a2ui} surfaces`}
                mono
                value={data?.a2ui_versions.join(', ') || missing}
              />
            </TechnicalDetails>
          </div>
        </>
      )}
    </div>
  );
}

function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host || endpoint;
  } catch {
    return endpoint;
  }
}

function formatMarketplaceRegistry(marketplace: CapabilityVersions['marketplace']): string {
  if (!marketplace) return 'Not configured';
  const ref = marketplace.ref || 'default ref';
  const commit = marketplace.installed_commit
    ? marketplace.installed_commit.slice(0, 12)
    : undefined;
  return commit
    ? `${marketplace.source}, ref ${ref}, installed ${commit}`
    : `${marketplace.source}, ref ${ref}, installed commit unavailable`;
}

const PLACEHOLDERS = new Set(['Unavailable', 'Loading…', 'Not configured']);

/** A read-only value in the control column: one line, cut with its full text on hover. */
function AboutValue({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): ReactNode {
  const placeholder = PLACEHOLDERS.has(value);
  return (
    <SettingsRow title={label}>
      <span
        className={cn(
          'min-w-0 truncate text-right',
          placeholder
            ? 'text-xs text-faint'
            : mono
              ? 'font-mono text-xs tabular-nums'
              : 'text-[0.78125rem]',
        )}
        data-slot="settings-value"
        title={value}
      >
        {value}
      </span>
    </SettingsRow>
  );
}
