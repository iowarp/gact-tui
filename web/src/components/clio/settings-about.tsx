import { SETTINGS_COLUMN } from '@/lib/settings-fold';
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
import { t, ph } from '@lingui/core/macro';

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
  const missing = capabilities.isPending ? t`Loading…` : t`Unavailable`;
  return (
    <div>
      <SettingsSectionHeading description={t`Version and links.`} title={t`About`} />
      <SettingsGroupLabel>{t`This app`}</SettingsGroupLabel>
      <AboutValue label={t`Product`} value={brand.name} />
      <AboutValue label={t`Runtime`} value={inTauri() ? t`Desktop application` : t`Web browser`} />
      {brand.homeUrl ? (
        <SettingsRow title={t`Website`}>
          <Button asChild className="shrink-0" size="sm" variant="outline">
            <ExternalLink href={brand.homeUrl}>
              {t`Product website`}
              <ExternalLinkIcon aria-hidden="true" />
            </ExternalLink>
          </Button>
        </SettingsRow>
      ) : null}
      <SettingsGroupLabel>{t`Connected service`}</SettingsGroupLabel>
      {capabilities.error ? (
        <div className={cn('w-full border-b border-border/70 py-1', SETTINGS_COLUMN)}>
          <StateView
            action={{ label: t`Retry`, onClick: () => void capabilities.refetch() }}
            kind="error"
            size="row"
            title={t`Service details could not be loaded.`}
          />
        </div>
      ) : (
        <>
          {!data || data.service?.version ? (
            <AboutValue
              label={t`Agent service version`}
              mono
              value={data?.service?.version || missing}
            />
          ) : null}
          {/* Rows the service does not report are left out rather than filled with a placeholder. */}
          {!data || versions?.backend_build ? (
            <AboutValue label={t`Backend build`} mono value={versions?.backend_build || missing} />
          ) : null}
          {!data || versions?.python ? (
            <AboutValue label={t`Python`} mono value={versions?.python || missing} />
          ) : null}
          {!data || versions ? (
            <AboutValue
              label={t`Marketplace registry`}
              mono
              value={versions ? formatMarketplaceRegistry(versions.marketplace) : missing}
            />
          ) : null}
          <div className="w-full py-2">
            <TechnicalDetails
              contentClassName="pt-1"
              summaryClassName="text-xs font-normal"
              title={t`Technical details`}
            >
              <AboutValue label={t`Address`} mono value={endpointHost(settings.endpoint)} />
              <AboutValue
                label={t`Active model`}
                mono
                value={
                  activeModel
                    ? `${activeModel.provider_id}/${activeModel.model_id}${activeModel.effort ? `, ${activeModel.effort}` : ''}`
                    : missing
                }
              />
              <AboutValue
                label={t`Workspace protocol`}
                mono
                value={data?.gact_versions.join(', ') || missing}
              />
              <AboutValue
                label={t`${ph({ a2ui: PROTOCOL.a2ui })} surfaces`}
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
  if (!marketplace) return t`Not configured`;
  const ref = marketplace.ref || t`default ref`;
  const commit = marketplace.installed_commit
    ? marketplace.installed_commit.slice(0, 12)
    : undefined;
  const { source } = marketplace;
  return commit
    ? t`${source}, ref ${ref}, installed ${commit}`
    : t`${source}, ref ${ref}, installed commit unavailable`;
}

const PLACEHOLDERS = new Set([t`Unavailable`, t`Loading…`, t`Not configured`]);

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
          // Inline-size containment keeps a long value (a registry URL) from widening the
          // control column, so the value is cut instead of the label.
          'min-w-0 flex-1 truncate text-left [contain:inline-size] @xs:text-right max-[1023px]:in-data-window-content:text-left!',
          placeholder
            ? 'text-xs text-faint'
            : mono
              ? 'font-mono text-xs text-muted-foreground tabular-nums'
              : 'text-menu text-muted-foreground',
        )}
        data-slot="settings-value"
        title={value}
      >
        {value}
      </span>
    </SettingsRow>
  );
}
