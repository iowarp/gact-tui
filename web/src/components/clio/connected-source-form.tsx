import type {
  CreateSourceInput,
  SourceMode,
  SourceProvider,
  ConnectedSourceState,
} from '@clio/core/v3';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { useRepository } from '@/hooks/use-repository';
import { HostPathPicker } from './host-path-picker';
import { InfoTip } from './info-tip';
import { SourceProviderLogo } from './source-provider-logo';

import { sourceModeNames } from './connected-source-labels';
const modeDescriptions: Record<SourceMode, string> = {
  read_only:
    'Copy selected inputs into protected storage on this CLIO. Refresh explicitly to get upstream changes.',
  working_copy:
    'Keep an immutable input baseline and a writable workspace copy. Review selected changes before applying them upstream.',
  write_enabled:
    'Use the actual writable source folder. Ordinary file operations change the original files.',
};

/** Node capabilities determine which real access modes can be offered. */
export function ConnectedSourceForm({
  workspaceId,
  provider,
  hostLabel,
  onConnected,
  onBack,
}: {
  workspaceId: string;
  provider: SourceProvider;
  hostLabel: string;
  onConnected: (source: ConnectedSourceState) => void;
  onBack: () => void;
}) {
  const repository = useRepository();
  const [label, setLabel] = useState('');
  const [root, setRoot] = useState('');
  const [mode, setMode] = useState<SourceMode>('read_only');
  const [configuration, setConfiguration] = useState<
    NonNullable<CreateSourceInput['configuration']>
  >({});
  const connect = useMutation({
    mutationFn: () =>
      repository.createConnectedSource(workspaceId, {
        provider: provider.id,
        label: label.trim() || provider.name,
        root: root.trim(),
        mode,
        configuration,
      }),
    onSuccess: onConnected,
  });
  const configField = (key: keyof typeof configuration, name: string, placeholder: string) => (
    <Field>
      <FieldLabel htmlFor={`source-${key}`}>{name}</FieldLabel>
      <Input
        id={`source-${key}`}
        value={configuration[key] ?? ''}
        placeholder={placeholder}
        onChange={(e) => setConfiguration((previous) => ({ ...previous, [key]: e.target.value }))}
      />
    </Field>
  );
  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        connect.mutate();
      }}
    >
      <div className="flex items-center gap-3">
        <SourceProviderLogo provider={provider.id} />
        <div>
          <h3 className="font-medium">Connect {provider.name}</h3>
          <p className="text-xs text-muted-foreground">Data will be available on {hostLabel}</p>
        </div>
      </div>
      <fieldset disabled={connect.isPending || !provider.configured} className="space-y-4">
        <Field>
          <FieldLabel htmlFor="source-label">Name</FieldLabel>
          <Input
            id="source-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="OPAL inputs"
          />
        </Field>
        {provider.id === 'sftp' &&
          configField('ssh_profile', 'SSH profile on this CLIO', 'research-storage')}
        {provider.id === 'globus' &&
          configField('collection_id', 'Source collection ID', 'Collection UUID')}
        <Field>
          <FieldLabel htmlFor="source-root">
            {provider.id === 'google_drive' ? 'Google Drive folder ID' : 'Source folder'}
          </FieldLabel>
          <div className="flex gap-2">
            <Input
              id="source-root"
              required
              value={root}
              onChange={(e) => setRoot(e.target.value)}
              placeholder={
                provider.id === 'google_drive'
                  ? 'Folder ID from its Google Drive link'
                  : '/path/to/data'
              }
            />
            {provider.id === 'local' && (
              <HostPathPicker
                targetId="local"
                hostLabel={hostLabel}
                label="Browse source folder"
                path={root}
                onChoose={setRoot}
                disabled={connect.isPending}
              />
            )}
          </div>
        </Field>
        {provider.id === 'globus' && (
          <details className="rounded-md border p-3" open>
            <summary className="cursor-pointer text-sm font-medium">
              Destination collection on {hostLabel}
            </summary>
            <div className="mt-3 space-y-3">
              {configField(
                'destination_collection_id',
                'Destination collection ID',
                'Collection UUID',
              )}
              {configField(
                'destination_collection_root',
                'Collection-visible folder',
                '/data/clio',
              )}
              {configField('destination_local_root', 'Same folder on this CLIO', '/data/clio')}
              <p className="text-xs text-muted-foreground">
                CLIO source storage must be inside this mapped folder.
              </p>
            </div>
          </details>
        )}
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">Folder mode</legend>
          {(Object.keys(sourceModeNames) as SourceMode[]).map((value) => {
            const available = provider.capabilities.supported_modes.includes(value);
            return (
              <div key={value} className="flex items-center gap-2 rounded-md border px-3 py-2.5">
                <label
                  className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm ${available ? '' : 'text-muted-foreground'}`}
                >
                  <input
                    type="radio"
                    aria-label={sourceModeNames[value]}
                    name="source-mode"
                    value={value}
                    checked={mode === value}
                    disabled={!available}
                    onChange={() => setMode(value)}
                  />
                  {sourceModeNames[value]}
                  {value === 'read_only' && (
                    <span className="ml-auto text-xs text-muted-foreground">Default</span>
                  )}
                </label>
                <InfoTip label={`About ${sourceModeNames[value]}`}>
                  {available
                    ? modeDescriptions[value]
                    : (provider.capabilities.unavailable_reasons[value] ??
                      'This node does not support this mode.')}
                </InfoTip>
              </div>
            );
          })}
        </fieldset>
      </fieldset>
      {provider.setup_requirement && (
        <p role="status" className="rounded-md border p-3 text-sm">
          {provider.setup_requirement}
        </p>
      )}
      {connect.error && (
        <p role="alert" className="text-sm text-destructive">
          {connect.error.message}
        </p>
      )}
      <div className="flex justify-between gap-2">
        <Button type="button" variant="ghost" onClick={onBack} disabled={connect.isPending}>
          Back
        </Button>
        <Button type="submit" disabled={connect.isPending || !provider.configured || !root.trim()}>
          {connect.isPending
            ? 'Connecting…'
            : provider.authentication === 'browser'
              ? 'Continue to sign in'
              : 'Connect folder'}
        </Button>
      </div>
    </form>
  );
}
