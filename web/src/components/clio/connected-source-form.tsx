import { inTauri } from '@/lib/transport/tauri-runtime';
import { vocab } from '@/lib/brand-vocabulary';
import type {
  CreateSourceInput,
  SourceProvider,
  ConnectedSourceState,
  SftpCredentials,
  SourceMode,
} from '@clio/core/v3';
import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { useRepository } from '@/hooks/use-repository';
import { HostPathPicker } from './host-path-picker';
import { InfoTip } from './info-tip';
import { SourceProviderLogo } from './source-provider-logo';
import { ObsidianSourceForm, type ObsidianChoice } from './obsidian-source-form';
import { SourceSshTarget } from './source-ssh-target';
import { GitHubRevisionPicker } from './github-revision-picker';
import { GlobusReceivingStorageControl } from './globus-receiving-storage';
import { SourceAccessChoice } from './source-access-choice';
import { ObsidianSyncDirection } from './obsidian-sync-direction';
import { vaultModes, vaultReasons } from './connected-source-labels';
import {
  defaultSourceUse,
  rememberSourceAccess,
  rememberedSourceAccess,
  type SourceUse,
} from './source-access-intent';

/** Node capabilities determine which real access modes can be offered. */
export function ConnectedSourceForm({
  workspaceId,
  provider,
  hostLabel,
  browseStartPath,
  source,
  obsidianChoice,
  onConnected,
  onBack,
}: {
  workspaceId: string;
  provider: SourceProvider;
  hostLabel: string;
  browseStartPath?: string;
  source?: ConnectedSourceState;
  obsidianChoice?: ObsidianChoice;
  onConnected: (source: ConnectedSourceState) => void;
  onBack: () => void;
}) {
  const formId = useId();
  const repository = useRepository();
  const [sftpCredentials, setSftpCredentials] = useState<SftpCredentials>();
  const [label, setLabel] = useState(source?.label ?? '');
  const [root, setRoot] = useState(source?.root ?? '');
  const [githubRevisionValid, setGithubRevisionValid] = useState(provider.id !== 'github');
  const supportedModes = provider.capabilities.supported_modes;
  const [mode, setMode] = useState<SourceMode>(
    source?.mode ??
      (supportedModes.includes('read_only') ? 'read_only' : (supportedModes[0] ?? 'read_only')),
  );
  const locationLocked = Boolean(source && !source.can_edit_location);
  const [chosenUse, setChosenUse] = useState<SourceUse | undefined>(
    source ? rememberedSourceAccess(source.id)?.use : undefined,
  );
  const [confirmed, setConfirmed] = useState(source?.mode === 'write_enabled');
  const [sshFolder, setSshFolder] = useState<{ label: string; startPath?: string }>();
  const [configuration, setConfiguration] = useState<
    NonNullable<CreateSourceInput['configuration']>
  >(source?.configuration ?? {});
  // An SSH target opened from Desktop only downloads; GitHub only links.
  const uses: SourceUse[] = [
    ...(provider.id === 'sftp' && configuration.target_id && configuration.ssh_origin !== 'clio'
      ? []
      : (['link'] as const)),
    ...((provider.capabilities as { download?: boolean }).download === false
      ? []
      : (['transfer'] as const)),
  ];
  const use = chosenUse && uses.includes(chosenUse) ? chosenUse : defaultSourceUse(mode, uses);
  const needsConfirmation = provider.id !== 'obsidian' && mode === 'write_enabled' && !confirmed;
  const chooseMode = (next: SourceMode) => {
    setMode(next);
    if (next === 'write_enabled') setConfirmed(source?.mode === 'write_enabled');
  };
  const connect = useMutation({
    mutationFn: () => {
      const input: CreateSourceInput = {
        provider: provider.id,
        label:
          label.trim() ||
          (provider.id === 'local' ||
          provider.id === 'obsidian' ||
          (provider.id === 'sftp' && inTauri())
            ? root
                .trim()
                .replace(/[/\\]+$/, '')
                .split(/[/\\]/)
                .pop() || provider.name
            : provider.name),
        root: root.trim(),
        // A source with history keeps its mode; its link or copy takes the new Access.
        mode: locationLocked && source?.mode ? source.mode : mode,
        configuration,
        ...(sftpCredentials ? { sftp_credentials: sftpCredentials } : {}),
      };
      return source
        ? repository.updateConnectedSource(workspaceId, source.id, input)
        : repository.createConnectedSource(workspaceId, input);
    },
    onSuccess: (saved) => {
      if (use) rememberSourceAccess(saved.id, { mode, use, confirmed });
      onConnected(saved);
    },
  });
  const configField = (key: keyof typeof configuration, name: string, placeholder: string) => (
    <Field>
      <FieldLabel htmlFor={`source-${key}`}>{name}</FieldLabel>
      <Input
        form={formId}
        id={`source-${key}`}
        value={
          Array.isArray(configuration[key])
            ? configuration[key].join(', ')
            : (configuration[key] ?? '')
        }
        placeholder={placeholder}
        onChange={(e) => setConfiguration((previous) => ({ ...previous, [key]: e.target.value }))}
      />
    </Field>
  );
  return provider.id === 'obsidian' && !source ? (
    <ObsidianSourceForm
      initialChoice={obsidianChoice}
      workspaceId={workspaceId}
      hostLabel={hostLabel}
      browseStartPath={browseStartPath}
      onConnected={onConnected}
      onBack={onBack}
    />
  ) : (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <SourceProviderLogo provider={provider.id} />
        <div>
          <h3 className="font-medium">
            {source
              ? 'Edit source'
              : provider.id === 'local'
                ? 'Use an existing folder'
                : `Connect ${provider.name}`}
          </h3>
          <p className="text-xs text-muted-foreground">Data will be available on {hostLabel}</p>
        </div>
      </div>
      <fieldset disabled={connect.isPending} className="space-y-4">
        <Field>
          <FieldLabel htmlFor="source-label">
            Name <span className="text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Input
            form={formId}
            id="source-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Optional name"
          />
        </Field>
        <fieldset disabled={locationLocked} className="space-y-4">
          {locationLocked && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Folder retained</span>
              <InfoTip label="Why source location is retained">
                This source has data or transfer history. Its folder identifies that evidence. You
                can rename it, or connect another folder as a new source.
              </InfoTip>
            </div>
          )}
          {provider.id === 'obsidian' && (
            <div className="space-y-3 text-sm">
              <p className="text-xs text-muted-foreground">
                This vault is a knowledge source. Only its approved folder is available to knowledge
                tools. Hidden folders and Obsidian settings are excluded.
              </p>
              {configuration.obsidian_connection === 'headless_sync' && (
                <div className="space-y-2">
                  <p>
                    {vocab.agent} manages this synced copy on {hostLabel}. Manage the official Sync
                    client and its account in Settings → Data sources → Obsidian.
                  </p>
                  <Field>
                    <FieldLabel htmlFor="vault-sync-mode">Sync direction</FieldLabel>
                    <ObsidianSyncDirection
                      id="vault-sync-mode"
                      value={configuration.obsidian_sync_mode ?? 'pull-only'}
                      onChange={(obsidian_sync_mode) =>
                        setConfiguration((previous) => ({ ...previous, obsidian_sync_mode }))
                      }
                    />
                  </Field>
                  <p className="text-xs text-muted-foreground">
                    Sync direction is separate from permission for the agent to edit notes.
                  </p>
                </div>
              )}
            </div>
          )}
          {provider.id === 'sftp' && (
            <SourceSshTarget
              hostLabel={hostLabel}
              initialTargetId={source?.configuration.target_id}
              onChange={(target, startPath, credentials) => {
                setSftpCredentials(credentials);
                setConfiguration((previous) => ({
                  ...previous,
                  target_id: target?.id ?? '',
                  ssh_origin: inTauri() ? 'desktop' : 'clio',
                  ssh_authentication:
                    credentials?.password !== undefined
                      ? 'password'
                      : credentials?.private_key
                        ? 'key'
                        : 'configured',
                }));
                setSshFolder(target ? { label: target.label, startPath } : undefined);
                setRoot('');
              }}
            />
          )}
          {provider.id === 'globus' &&
            configField('collection_id', 'Source collection ID', 'Collection UUID')}
          <Field>
            <div className="flex items-center gap-2">
              <FieldLabel htmlFor="source-root">
                {provider.id === 'google_drive'
                  ? 'Google Drive folder link'
                  : provider.id === 'github'
                    ? 'Repository or folder link'
                    : provider.id === 'ndp'
                      ? 'Dataset'
                      : 'Source folder'}
              </FieldLabel>
              {provider.id === 'google_drive' && (
                <InfoTip label="How to choose a Google Drive folder">
                  Open your folder in Google Drive, copy the address from your browser, and paste it
                  here. You can also paste a folder ID. The link does not change sharing
                  permissions.
                </InfoTip>
              )}
            </div>
            <div className="flex gap-2">
              {provider.id !== 'local' && provider.id !== 'sftp' && provider.id !== 'obsidian' && (
                <Input
                  form={formId}
                  id="source-root"
                  required
                  value={root}
                  onChange={(e) => {
                    setRoot(e.target.value);
                    if (provider.id === 'github')
                      setConfiguration((previous) => ({ ...previous, github_ref: '' }));
                  }}
                  placeholder={
                    provider.id === 'google_drive'
                      ? 'https://drive.google.com/drive/folders/…'
                      : provider.id === 'github'
                        ? 'https://github.com/owner/repository/tree/main/folder'
                        : '/path/to/data'
                  }
                />
              )}
              {(provider.id === 'local' ||
                provider.id === 'sftp' ||
                provider.id === 'obsidian') && (
                <div className="flex min-w-0 w-full items-center gap-3 rounded-md border p-2">
                  <HostPathPicker
                    targetId={provider.id === 'sftp' ? configuration.target_id || '' : 'local'}
                    hostLabel={
                      provider.id === 'sftp' ? sshFolder?.label || 'selected SSH host' : hostLabel
                    }
                    label={
                      provider.id === 'obsidian' ? 'Vault or folder inside it' : 'Source folder'
                    }
                    triggerLabel="Choose folder"
                    startPath={provider.id === 'sftp' ? sshFolder?.startPath : browseStartPath}
                    path={root}
                    onChoose={setRoot}
                    browse={
                      provider.id === 'sftp' && configuration.ssh_origin === 'clio'
                        ? (path, signal) =>
                            repository.inspectSourceSsh(
                              {
                                target_id: configuration.target_id,
                                path,
                                credentials: sftpCredentials,
                              },
                              signal,
                            )
                        : undefined
                    }
                    disabled={
                      connect.isPending || (provider.id === 'sftp' && !configuration.target_id)
                    }
                  />
                  <span role="status" className="min-w-0 break-all text-sm text-muted-foreground">
                    {root || 'No folder chosen'}
                  </span>
                </div>
              )}
            </div>
          </Field>
          {provider.id === 'github' && (
            <GitHubRevisionPicker
              key={root.trim()}
              root={root}
              value={configuration.github_ref ?? ''}
              formId={formId}
              disabled={locationLocked}
              onValidityChange={setGithubRevisionValid}
              onChange={(github_ref) =>
                setConfiguration((previous) => ({ ...previous, github_ref }))
              }
            />
          )}
        </fieldset>
        {provider.id === 'obsidian' && (
          <p className="text-xs text-muted-foreground">
            Connect this vault as a knowledge source. Notes open in the graph, file list, and
            reader.
          </p>
        )}
        <SourceAccessChoice
          value={mode}
          onChange={chooseMode}
          supported={provider.id === 'obsidian' ? vaultModes : supportedModes}
          reasons={
            provider.id === 'obsidian' ? vaultReasons : provider.capabilities.unavailable_reasons
          }
          disabled={connect.isPending}
          uses={uses}
          use={use}
          onUseChange={setChosenUse}
          confirmed={confirmed}
          onConfirmedChange={provider.id === 'obsidian' ? undefined : setConfirmed}
        />
      </fieldset>
      {connect.error && (
        <p role="alert" className="text-sm text-destructive">
          {connect.error.message}
        </p>
      )}
      {provider.id === 'globus' ? <GlobusReceivingStorageControl hostLabel={hostLabel} /> : null}
      <form
        id={formId}
        className="flex justify-between gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          connect.mutate();
        }}
      >
        <Button type="button" variant="ghost" onClick={onBack} disabled={connect.isPending}>
          {source ? 'Cancel' : 'Back'}
        </Button>
        <Button
          type="submit"
          disabled={
            connect.isPending ||
            needsConfirmation ||
            (provider.id === 'github' && !githubRevisionValid) ||
            ((provider.id === 'local' || provider.id === 'sftp' || provider.id === 'obsidian') &&
              !root.trim())
          }
        >
          {connect.isPending
            ? source
              ? 'Saving…'
              : 'Connecting…'
            : source
              ? 'Save changes'
              : provider.id === 'obsidian'
                ? 'Connect vault'
                : 'Connect folder'}
        </Button>
      </form>
    </div>
  );
}
