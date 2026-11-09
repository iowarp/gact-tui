import type { LanguageModelPreset, ProviderCatalogEntry, SavedServer } from '@clio/core/v3';
import { CircleCheckIcon, ServerIcon } from 'lucide-react';
import { useSavedServers } from '@/hooks/use-saved-servers';
import { useServerCheck } from '@/hooks/use-server-check';
import { RefreshIcon } from '@/lib/icon-vocabulary';
import { isLoopbackAddress, serverStatus, serverStatusWords } from '@/lib/local-servers';
import { providerConnectionLabel, providerCredentialStateLabel } from '@/lib/provider-availability';
import { formatFreshness, type ProviderGroup } from './model-picker-model';
import { DetailPane } from './primitives/detail-pane';
import { IconButton } from './primitives/icon-button';
import { KeyValueGrid, type KeyValueItem } from './primitives/key-value-grid';
import { StatusIndicator } from './primitives/status-indicator';
import { SettingsGroupLabel } from './settings-row';
import { TechnicalDetails } from './technical-details';

export interface ModelServerDetailsProps {
  preset: LanguageModelPreset;
  saved: SavedServer | undefined;
  group: ProviderGroup | undefined;
  catalogEntry: ProviderCatalogEntry | undefined;
  isDefault: boolean;
  applying: boolean;
  /** Make this server the default, with `model` when one was found. */
  onUse: (address: string, model: string | undefined) => void;
  onClose: () => void;
}

/**
 * One model server's details beside the list: what kind it is and where, with
 * Use and Check again in the title row, its status and address, the models it
 * reports, and, behind a collapsed disclosure, the technical facts (what the
 * service last reported, when, and the raw reason) for when something breaks
 * and someone needs to say exactly what. Editing and removing stay on the row.
 */
export function ModelServerDetails({
  preset,
  saved,
  group,
  catalogEntry,
  isDefault,
  applying,
  onUse,
  onClose,
}: ModelServerDetailsProps) {
  const custom = saved?.custom ?? false;
  const address = saved?.address || preset.api_base || '';
  const label = custom && saved ? saved.label : preset.label;
  const { check } = useSavedServers();
  const localCheck = useServerCheck(preset.id);
  const latest =
    localCheck.data ??
    (saved?.check ? { reachable: saved.check.reachable, models: saved.check.models } : undefined);
  const status = serverStatus({ custom, group, latest });
  const words = serverStatusWords(status, address, label);
  const pending = check.isPending || localCheck.isPending;
  const models = latest
    ? latest.models
    : (catalogEntry?.models.map((model) => model.model_id) ?? []);
  const kind = custom ? 'OpenAI-compatible server' : 'Model server';
  const where = isLoopbackAddress(address) ? 'on this computer' : 'on another machine';

  function runCheck() {
    if (saved) check.mutate(saved.id);
    else localCheck.mutate(address);
  }

  const summary: KeyValueItem[] = [
    {
      label: 'Status',
      value: (
        <StatusIndicator
          label={pending ? 'Checking' : words.label}
          tone={pending ? 'running' : words.tone}
        />
      ),
      title: words.hint ?? words.label,
    },
    { label: 'Address', value: address, mono: true },
    { label: 'Default model', value: isDefault ? 'New work uses this server' : 'Not in use' },
  ];
  const endpoint = catalogEntry?.endpoint || group?.endpoint || preset.api_base;
  const facts: Array<[string, string | undefined]> = [
    ['Provider id', custom && saved ? saved.id : preset.id],
    // Only when the catalog reaches it somewhere other than the Address above.
    ['Endpoint', endpoint && endpoint !== address ? endpoint : undefined],
    ['Catalog health', catalogEntry?.health],
    ['Connection', catalogEntry ? providerConnectionLabel(catalogEntry.connectivity) : undefined],
    [
      'Credentials',
      catalogEntry ? providerCredentialStateLabel(preset, catalogEntry.auth) : undefined,
    ],
    ['Configuration state', preset.status],
    [
      'Last checked',
      saved?.check
        ? formatFreshness(saved.check.checked_at)
        : group?.freshness
          ? formatFreshness(group.freshness)
          : undefined,
    ],
    ['Catalog source', catalogEntry?.freshness.source],
    [
      'Raw reason',
      saved?.check?.error || catalogEntry?.failure || preset.status_message || undefined,
    ],
  ];
  const technical = facts
    .filter((fact): fact is [string, string] => Boolean(fact[1]))
    .map(([name, value]) => ({ label: name, value, mono: true }));

  return (
    <DetailPane
      actions={
        <>
          {!isDefault && status.kind === 'running' ? (
            <IconButton
              disabled={applying || pending}
              icon={<CircleCheckIcon />}
              label={`Use ${label}`}
              onClick={() => onUse(address, latest?.models[0])}
            />
          ) : null}
          <IconButton
            disabled={pending}
            icon={<RefreshIcon />}
            label="Check again"
            onClick={runCheck}
          />
        </>
      }
      icon={<ServerIcon />}
      onClose={onClose}
      title={label}
    >
      <div className="grid gap-1" data-slot="model-server-details">
        <p
          className="mb-1.5 flex min-w-0 gap-3 text-xs text-faint whitespace-nowrap"
          data-slot="detail-meta"
        >
          <span className="truncate">{kind}</span>
          <span className="truncate">{where}</span>
        </p>
        <KeyValueGrid items={summary} />
        <SettingsGroupLabel className="mt-3">
          {models.length === 1 ? '1 model' : `${models.length} models`}
        </SettingsGroupLabel>
        {models.length ? (
          <ul className="grid gap-0.5" aria-label={`Models on ${label}`}>
            {models.map((model) => (
              <li className="truncate font-mono text-[11.5px]" key={model} title={model}>
                {model}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            {status.kind === 'running'
              ? 'It is running, but no model is loaded yet.'
              : 'Models appear here once it answers.'}
          </p>
        )}
        {technical.length ? (
          <TechnicalDetails
            className="mt-3"
            contentClassName="pt-1"
            summaryClassName="text-xs font-normal"
            title="Technical details"
          >
            <KeyValueGrid items={technical} />
          </TechnicalDetails>
        ) : null}
      </div>
    </DetailPane>
  );
}
