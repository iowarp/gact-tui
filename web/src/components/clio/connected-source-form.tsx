import { inTauri } from '@/lib/transport/tauri-runtime';
import type {
  CreateSourceInput,
  SourceProvider,
  ConnectedSourceState,
  SftpCredentials,
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
import { SourceSshTarget } from './source-ssh-target';
import { GitHubRevisionPicker } from './github-revision-picker';

/** Node capabilities determine which real access modes can be offered. */
export function ConnectedSourceForm({
  workspaceId,
  provider,
  hostLabel,
  browseStartPath,
  source,
  onConnected,
  onBack,
}: {
  workspaceId: string;
  provider: SourceProvider;
  hostLabel: string;
  browseStartPath?: string;
  source?: ConnectedSourceState;
  onConnected: (source: ConnectedSourceState) => void;
  onBack: () => void;
}) {
  const formId = useId();
  const repository = useRepository();
  const [sftpCredentials, setSftpCredentials] = useState<SftpCredentials>();
  const [label, setLabel] = useState(source?.label ?? '');
  const [root, setRoot] = useState(source?.root ?? '');
  const [githubRevisionValid, setGithubRevisionValid] = useState(provider.id !== 'github');
  const mode = source?.mode ?? 'read_only';
  const locationLocked = Boolean(source && !source.can_edit_location);
  const [sshFolder, setSshFolder] = useState<{ label: string; startPath?: string }>();
  const [configuration, setConfiguration] = useState<
    NonNullable<CreateSourceInput['configuration']>
  >(source?.configuration ?? {});
  const connect = useMutation({
    mutationFn: () => {
      const input: CreateSourceInput = {
        provider: provider.id,
        label:
          label.trim() ||
          (provider.id === 'local' || (provider.id === 'sftp' && inTauri())
            ? root
                .trim()
                .replace(/[/\\]+$/, '')
                .split(/[/\\]/)
                .pop() || provider.name
            : provider.name),
        root: root.trim(),
        mode,
        configuration,
        ...(sftpCredentials ? { sftp_credentials: sftpCredentials } : {}),
      };
      return source
        ? repository.updateConnectedSource(workspaceId, source.id, input)
        : repository.createConnectedSource(workspaceId, input);
    },
    onSuccess: onConnected,
  });
  const configField = (key: keyof typeof configuration, name: string, placeholder: string) => (
    <Field>
      <FieldLabel htmlFor={`source-${key}`}>{name}</FieldLabel>
      <Input
        form={formId}
        id={`source-${key}`}
        value={configuration[key] ?? ''}
        placeholder={placeholder}
        onChange={(e) => setConfiguration((previous) => ({ ...previous, [key]: e.target.value }))}
      />
    </Field>
  );
  return (
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
              {provider.id !== 'local' && provider.id !== 'sftp' && (
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
              {(provider.id === 'local' || provider.id === 'sftp') && (
                <div className="flex min-w-0 w-full items-center gap-3 rounded-md border p-2">
                  <HostPathPicker
                    targetId={provider.id === 'sftp' ? configuration.target_id || '' : 'local'}
                    hostLabel={
                      provider.id === 'sftp' ? sshFolder?.label || 'selected SSH host' : hostLabel
                    }
                    label="Source folder"
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
          <p className="text-xs text-muted-foreground">
            Choose Download or Link and how edits are handled after connecting.
          </p>
        </fieldset>
      </fieldset>
      {connect.error && (
        <p role="alert" className="text-sm text-destructive">
          {connect.error.message}
        </p>
      )}
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
            (provider.id === 'github' && !githubRevisionValid) ||
            ((provider.id === 'local' || provider.id === 'sftp') && !root.trim())
          }
        >
          {connect.isPending
            ? source
              ? 'Saving…'
              : 'Connecting…'
            : source
              ? 'Save changes'
              : 'Connect folder'}
        </Button>
      </form>
    </div>
  );
}
