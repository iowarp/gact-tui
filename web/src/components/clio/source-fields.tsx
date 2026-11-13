import { inTauri } from '@/lib/transport/tauri-runtime';
import { vocab } from '@/lib/brand-vocabulary';
import type { SourceProvider } from '@clio/core/v3';
import { Input } from '@/components/ui/input';
import { useRepository } from '@/hooks/use-repository';
import { HostPathPicker } from './host-path-picker';
import { InfoTip } from './info-tip';
import { SourceSshTarget } from './source-ssh-target';
import { GitHubRevisionPicker } from './github-revision-picker';
import { GlobusReceivingStorageControl } from './globus-receiving-storage';
import { SourceS3Fields } from './source-s3-fields';
import { browsedProviders, type SourceFieldsState } from './use-source-fields';
import { FolderFace, SourceField, folderTriggerClass, sourceInputClass } from './source-form-parts';

const linkLabels: Partial<Record<SourceProvider['id'], string>> = {
  google_drive: 'Google Drive folder link',
  github: 'Repository or folder link',
  ndp: 'Dataset',
  globus: 'Folder in the collection',
  s3: 'Bucket and prefix',
};
const placeholders: Partial<Record<SourceProvider['id'], string>> = {
  google_drive: 'https://drive.google.com/drive/folders/…',
  github: 'https://github.com/owner/repository/tree/main/folder',
  globus: '/path/to/data',
  ndp: 'Dataset name',
  s3: 'bucket-name/prefix',
};

/**
 * The provider's own fields, in the spec's order: where the data is, then its
 * revision or receiving storage, then an optional name.
 */
export function SourceFields({
  fields,
  hostLabel,
  browseStartPath,
  formId,
  disabled = false,
  initialFocus = false,
}: {
  fields: SourceFieldsState;
  hostLabel: string;
  browseStartPath?: string;
  formId: string;
  disabled?: boolean;
  /** Focus the Name field when the frame opens (a row's Edit). */
  initialFocus?: boolean;
}) {
  const repository = useRepository();
  const { provider, source, root, setRoot, configuration, setConfiguration, locationLocked } =
    fields;
  const lock = disabled || locationLocked;
  const retained = locationLocked ? (
    <>
      Folder retained
      <InfoTip label="Why the source location is retained">
        This source has data or transfer history. Its folder identifies that evidence. You can
        rename it, or connect another folder as a new source.
      </InfoTip>
    </>
  ) : undefined;
  const name = (
    <SourceField label="Name" htmlFor={`${formId}-label`} aside="Optional">
      <Input
        id={`${formId}-label`}
        form={formId}
        className={sourceInputClass}
        value={fields.label}
        disabled={disabled}
        data-initial-focus={initialFocus ? '' : undefined}
        placeholder={provider.id === 'local' ? 'The folder name' : provider.name}
        onChange={(event) => fields.setLabel(event.target.value)}
      />
    </SourceField>
  );
  if (browsedProviders.has(provider.id)) {
    const sftp = provider.id === 'sftp';
    return (
      <>
        {sftp && !locationLocked ? (
          <SourceSshTarget
            hostLabel={hostLabel}
            initialTargetId={source?.configuration.target_id}
            onChange={(target, startPath, credentials) => {
              fields.setSftpCredentials(credentials);
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
              fields.setSshFolder(target ? { label: target.label, startPath } : undefined);
              setRoot('');
            }}
          />
        ) : null}
        <SourceField
          label={provider.id === 'obsidian' ? 'Vault or folder inside it' : 'Folder'}
          aside={retained}
          hint={sftp ? undefined : `On ${hostLabel}`}
        >
          <FolderFace path={root}>
            {lock ? null : (
              <HostPathPicker
                targetId={sftp ? configuration.target_id || '' : 'local'}
                hostLabel={sftp ? fields.sshFolder?.label || 'the chosen SSH host' : hostLabel}
                label={provider.id === 'obsidian' ? 'Vault or folder inside it' : 'Source folder'}
                triggerLabel="Choose…"
                triggerClassName={folderTriggerClass}
                startPath={sftp ? fields.sshFolder?.startPath : browseStartPath}
                path={root}
                onChoose={setRoot}
                browse={
                  sftp && configuration.ssh_origin === 'clio'
                    ? (path, signal) =>
                        repository.inspectSourceSsh(
                          {
                            target_id: configuration.target_id,
                            path,
                            credentials: fields.sftpCredentials,
                          },
                          signal,
                        )
                    : undefined
                }
                disabled={disabled || (sftp && !configuration.target_id)}
              />
            )}
          </FolderFace>
        </SourceField>
        {provider.id === 'obsidian' && configuration.obsidian_connection === 'headless_sync' ? (
          <SourceField
            label="Sync direction"
            htmlFor={`${formId}-sync`}
            hint={`${vocab.agent} manages this synced copy on ${hostLabel}. Direction is separate from permission to edit notes.`}
          >
            <select
              id={`${formId}-sync`}
              className="h-[30px] w-full rounded-[7px] border border-input bg-transparent px-2 text-[12.5px] dark:bg-input/30"
              value={configuration.obsidian_sync_mode ?? 'pull-only'}
              disabled={disabled}
              onChange={(event) =>
                setConfiguration((previous) => ({
                  ...previous,
                  obsidian_sync_mode: event.target.value as 'pull-only' | 'bidirectional',
                }))
              }
            >
              <option value="pull-only">Download remote changes</option>
              <option value="bidirectional">Sync changes both ways</option>
            </select>
          </SourceField>
        ) : null}
        {name}
      </>
    );
  }
  return (
    <>
      {provider.id === 'globus' ? (
        <SourceField label="Collection" htmlFor={`${formId}-collection`} aside={retained}>
          <Input
            id={`${formId}-collection`}
            form={formId}
            className={sourceInputClass}
            value={configuration.collection_id ?? ''}
            disabled={lock}
            placeholder="Collection UUID"
            onChange={(event) =>
              setConfiguration((previous) => ({ ...previous, collection_id: event.target.value }))
            }
          />
        </SourceField>
      ) : null}
      <SourceField
        label={linkLabels[provider.id] ?? 'Folder'}
        htmlFor={`${formId}-root`}
        aside={
          provider.id === 'globus' ? undefined : provider.id === 'google_drive' && !lock ? (
            <InfoTip label="How to choose a Google Drive folder">
              Open your folder in Google Drive, copy the address from your browser, and paste it
              here. A folder ID works too, and the My Drive address connects your whole Drive. The
              link does not change sharing.
            </InfoTip>
          ) : (
            retained
          )
        }
      >
        <Input
          id={`${formId}-root`}
          form={formId}
          required
          className={sourceInputClass}
          value={root}
          disabled={lock}
          placeholder={placeholders[provider.id]}
          onChange={(event) => {
            setRoot(event.target.value);
            if (provider.id === 'github')
              setConfiguration((previous) => ({ ...previous, github_ref: '' }));
          }}
        />
      </SourceField>
      {provider.id === 'github' ? (
        <GitHubRevisionPicker
          key={root.trim()}
          root={root}
          value={configuration.github_ref ?? ''}
          formId={formId}
          disabled={lock}
          onValidityChange={fields.setGithubValid}
          onChange={(github_ref) => setConfiguration((previous) => ({ ...previous, github_ref }))}
        />
      ) : null}
      {provider.id === 'globus' ? <GlobusReceivingStorageControl hostLabel={hostLabel} /> : null}
      {provider.id === 's3' ? (
        <SourceS3Fields fields={fields} formId={formId} disabled={lock} />
      ) : null}
      {name}
    </>
  );
}
