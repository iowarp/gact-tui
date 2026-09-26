import type { LanguageModelPreset, ProviderCatalogEntry } from '@clio/core/v3';
import { Badge } from '@/components/ui/badge';
import {
  providerAvailability,
  providerConnectionLabel,
  providerConnectionNote,
  providerCredentialKind,
  providerCredentialLabel,
  providerCredentialStateLabel,
} from '@/lib/provider-availability';
import type { ClioModelOption } from '@/lib/model-options';
import { cn } from '@/lib/utils';
import { InfoTip } from './info-tip';
import { formatFreshness, providerUsableModelCount, type ProviderGroup } from './model-picker-model';

interface Fact {
  label: string;
  value: string | undefined;
  /** Why the value reads as it does, behind an info icon. */
  info?: string;
}

function supported(value: boolean | undefined): string | undefined {
  return value === undefined ? undefined : value ? 'Supported' : 'Not supported';
}

/**
 * The provider's availability and capability state, as the service reports
 * it -- what Settings > Models used to list under "Provider availability".
 * Labels and values only; a row the service did not report is left out.
 */
export function ProviderAvailabilityFacts({
  group,
  preset,
  catalogEntry,
}: {
  group: ProviderGroup;
  preset: LanguageModelPreset | undefined;
  catalogEntry: ProviderCatalogEntry | undefined;
}) {
  const availability = providerAvailability(undefined, preset);
  const credentialKind = providerCredentialKind(preset);
  // With no catalog entry the service has not checked the provider at all:
  // the credential row reads from the preset instead of a check result.
  const credentialState = catalogEntry
    ? providerCredentialStateLabel(preset, catalogEntry.auth)
    : credentialKind === 'none'
      ? 'Not required'
      : preset?.is_authenticated
        ? providerCredentialStateLabel(preset, 'ok')
        : 'Missing';
  const signInService = credentialKind === 'api_key' ? undefined : (catalogEntry?.auth_label ?? preset?.auth_label);
  const facts: Fact[] = [
    { label: 'Configuration', value: preset ? availability.label : undefined },
    {
      label: 'Connection',
      value: providerConnectionLabel(catalogEntry?.connectivity),
      info: providerConnectionNote(preset, catalogEntry?.connectivity),
    },
    {
      label: providerCredentialLabel(preset),
      value: signInService ? `${credentialState} (${signInService})` : credentialState,
    },
    { label: 'Endpoint', value: catalogEntry?.endpoint || group.endpoint || preset?.api_base },
    { label: 'Live model list', value: supported(preset?.supports_live_catalog) },
    { label: 'Vision', value: supported(preset?.supports_vision) },
    { label: 'Sign out', value: preset?.supports_logout ? 'Supported' : undefined },
    { label: 'Checked', value: group.freshness ? formatFreshness(group.freshness) : 'Not checked' },
  ];
  return (
    <div className="grid gap-3" data-slot="provider-availability">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        Availability
        <InfoTip label="About availability">
          Authentication and capability state reported by the connected service.
        </InfoTip>
      </h3>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_minmax(0,1fr)]">
        {facts
          .filter((fact): fact is Fact & { value: string } => Boolean(fact.value))
          .map(({ label, value, info }) => (
            <div className="contents" key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="flex min-w-0 items-center gap-1.5">
                <span className="truncate" title={value}>
                  {value}
                </span>
                {info ? <InfoTip label={`About ${label.toLowerCase()}`}>{info}</InfoTip> : null}
              </dd>
            </div>
          ))}
      </dl>
    </div>
  );
}

/**
 * The provider's models with counts: usable ones as the picker would offer
 * them (grouped per transport for a multi-transport provider), and any rows
 * the service reports but that cannot be used right now, marked as such.
 */
export function ProviderModelList({ group }: { group: ProviderGroup }) {
  const models = group.choices.filter((choice) => choice.kind !== 'provider' && choice.id);
  const usable = providerUsableModelCount(group);
  const unavailable = models.length - usable;
  const transports = group.transports ?? [];
  const sections =
    transports.length > 1
      ? transports.map((transport) => ({
          id: transport.id,
          label: transport.label,
          models: models.filter((model) => model.transport === transport.id),
        }))
      : [{ id: 'all', label: undefined, models }];
  return (
    <div className="grid gap-3" data-slot="provider-models">
      <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        Models
        <Badge variant="secondary">{usable} available</Badge>
        {unavailable > 0 ? <Badge variant="outline">{unavailable} unavailable</Badge> : null}
      </h3>
      {models.length ? (
        <div className="grid max-h-72 gap-3 overflow-y-auto rounded-md border p-2">
          {sections
            .filter((section) => section.models.length)
            .map((section) => (
              <div className="grid gap-1" key={section.id}>
                {section.label ? (
                  <p className="px-1 text-xs font-semibold text-muted-foreground">{section.label}</p>
                ) : null}
                <ul className="grid gap-0.5">
                  {section.models.map((model) => (
                    <ModelRow
                      key={`${model.transport ?? ''}:${model.id}`}
                      model={model}
                      usable={usable > 0 && model.available}
                    />
                  ))}
                </ul>
              </div>
            ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">None discovered</p>
      )}
    </div>
  );
}

function ModelRow({ model, usable }: { model: ClioModelOption; usable: boolean }) {
  return (
    <li
      className={cn(
        'flex min-w-0 items-baseline gap-2 rounded-sm px-1 py-0.5 text-sm',
        !usable && 'text-muted-foreground',
      )}
      title={model.id}
    >
      <span className="min-w-0 flex-1 truncate">{model.label}</span>
      {model.modalities?.length ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          {model.modalities.join(', ')}
        </span>
      ) : null}
      {!usable ? <span className="shrink-0 text-xs">Unavailable</span> : null}
    </li>
  );
}
