import type { LanguageModelPreset, ProviderCatalogEntry, SavedServer } from '@clio/core/v3';
import { ServerIcon } from 'lucide-react';
import { serverStatus, serverStatusWords } from '@/lib/local-servers';
import { providerConnectionLabel, providerCredentialStateLabel } from '@/lib/provider-availability';
import { formatFreshness, type ProviderGroup } from './model-picker-model';
import { DetailPane } from './primitives/detail-pane';
import { KeyValueGrid, type KeyValueItem } from './primitives/key-value-grid';
import { StatusIndicator } from './primitives/status-indicator';
import { SettingsGroupLabel } from './settings-row';

export interface ModelServerDetailsProps {
  preset: LanguageModelPreset;
  saved: SavedServer | undefined;
  group: ProviderGroup | undefined;
  catalogEntry: ProviderCatalogEntry | undefined;
  isDefault: boolean;
  onClose: () => void;
}

/**
 * One model server's details beside the list: its status and address, the
 * models it reports, and the technical facts (what the service last
 * reported, when, and the raw reason) for when something breaks and
 * someone needs to say exactly what.
 */
export function ModelServerDetails({
  preset,
  saved,
  group,
  catalogEntry,
  isDefault,
  onClose,
}: ModelServerDetailsProps) {
  const custom = saved?.custom ?? false;
  const address = saved?.address || preset.api_base || '';
  const label = custom && saved ? saved.label : preset.label;
  const latest = saved?.check
    ? { reachable: saved.check.reachable, models: saved.check.models }
    : undefined;
  const status = serverStatus({ custom, group, latest });
  const words = serverStatusWords(status, address, label);
  const models = saved?.check
    ? saved.check.models
    : (catalogEntry?.models.map((model) => model.model_id) ?? []);
  const summary: KeyValueItem[] = [
    {
      label: 'Status',
      value: <StatusIndicator label={words.label} tone={words.tone} />,
      title: words.hint ?? words.label,
    },
    { label: 'Address', value: address, mono: true },
    { label: 'Kind', value: custom ? 'OpenAI-compatible server' : preset.label },
    { label: 'Default model', value: isDefault ? 'New work uses this server' : 'Not in use' },
  ];
  const facts: Array<[string, string | undefined]> = [
    ['Provider id', custom && saved ? saved.id : preset.id],
    ['Endpoint', catalogEntry?.endpoint || group?.endpoint || preset.api_base],
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
    <DetailPane icon={<ServerIcon />} onClose={onClose} title={label}>
      <div className="grid gap-1" data-slot="model-server-details">
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
        <SettingsGroupLabel className="mt-3">Technical details</SettingsGroupLabel>
        <KeyValueGrid items={technical} />
      </div>
    </DetailPane>
  );
}
