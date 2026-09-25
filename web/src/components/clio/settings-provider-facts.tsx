import type { LanguageModelPreset, ProviderCatalogEntry } from '@clio/core/v3';
import { Badge } from '@/components/ui/badge';
import { providerAvailability } from '@/lib/provider-availability';
import type { ClioModelOption } from '@/lib/model-options';
import { cn } from '@/lib/utils';
import { InfoTip } from './info-tip';
import { formatFreshness, providerUsableModelCount, type ProviderGroup } from './model-picker-model';

/** A wire token ("not_required") as a readable state ("Not required"). */
function readable(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const words = value.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
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
  const signIn = [readable(catalogEntry?.auth), catalogEntry?.auth_label ?? preset?.auth_label]
    .filter(Boolean)
    .join(', ');
  const facts: Array<[string, string | undefined]> = [
    ['Configuration', preset ? availability.label : undefined],
    ['Connection', readable(catalogEntry?.connectivity)],
    ['Sign-in', signIn || readable(preset?.auth_method)],
    ['Endpoint', catalogEntry?.endpoint || group.endpoint || preset?.api_base],
    ['Live model list', supported(preset?.supports_live_catalog)],
    ['Vision', supported(preset?.supports_vision)],
    ['Sign out', preset?.supports_logout ? 'Supported' : undefined],
    ['Checked', group.freshness ? formatFreshness(group.freshness) : undefined],
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
          .filter((fact): fact is [string, string] => Boolean(fact[1]))
          .map(([label, value]) => (
            <div className="contents" key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 truncate" title={value}>
                {value}
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
