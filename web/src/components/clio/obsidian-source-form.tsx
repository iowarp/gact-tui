import { useId, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { ConnectedSourceState, SourceMode } from '@clio/core/v3';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { Input } from '@/components/ui/input';
import { CircleAlertIcon } from 'lucide-react';
import { vocab } from '@/lib/brand-vocabulary';
import { cn } from '@/lib/utils';
import { HostPathPicker } from './host-path-picker';
import { InfoTip } from './info-tip';
import { ObsidianAccountSettings } from './obsidian-account-settings';
import {
  AccessRows,
  ChoiceRows,
  FolderFace,
  SourceField,
  SourceStatusLine,
  folderTriggerClass,
  sourceInputClass,
} from './source-form-parts';
import type { SourceAccess } from './source-access';
import { useSourceFrameFooter } from './use-source-frame-footer';
import { t } from '@lingui/core/macro';

const { agent } = vocab;

export type ObsidianChoice = 'new' | 'existing' | 'sync';

/** Explicit vault creation and attachment share the same Obsidian knowledge semantics. */
type ObsidianSourceFormProps = {
  workspaceId: string;
  hostLabel: string;
  browseStartPath?: string;
  initialChoice?: ObsidianChoice;
  onConnected: (source: ConnectedSourceState) => void;
  onBack?: () => void;
};

export function ObsidianSourceForm(props: ObsidianSourceFormProps) {
  const { settings } = useConnectionSettings();
  return (
    <ObsidianSourceEditor key={`${connectionScope(settings)}:${props.workspaceId}`} {...props} />
  );
}

function ObsidianSourceEditor({
  workspaceId,
  hostLabel,
  browseStartPath,
  initialChoice = 'new',
  onConnected,
  onBack,
}: ObsidianSourceFormProps) {
  const id = useId();
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const scope = connectionScope(settings);
  const [choice, setChoice] = useState<ObsidianChoice>(initialChoice);
  const [label, setLabel] = useState('');
  const [root, setRoot] = useState('');
  const [mode, setMode] = useState<SourceMode>(
    initialChoice === 'new' ? 'write_enabled' : 'read_only',
  );
  const [vaultId, setVaultId] = useState('');
  const [encryptionPassword, setEncryptionPassword] = useState('');
  const [syncMode, setSyncMode] = useState<'pull-only' | 'bidirectional'>('pull-only');
  const account = useQuery({
    queryKey: ['obsidian-account', scope],
    queryFn: ({ signal }) => repository.obsidianStatus(signal),
    enabled: choice === 'sync',
    refetchInterval: choice === 'sync' ? 1500 : false,
    retry: false,
  });
  const vaults = useQuery({
    queryKey: ['obsidian-vaults', scope],
    queryFn: ({ signal }) => repository.obsidianVaults(signal),
    enabled: choice === 'sync' && Boolean(account.data?.authenticated),
    retry: false,
  });
  const connect = useMutation({
    mutationFn: async () => {
      const selectedRoot =
        choice === 'sync'
          ? (await repository.setupObsidianVault(vaultId, encryptionPassword)).root
          : root;
      const selectedVault = vaults.data?.vaults.find((vault) => vault.id === vaultId);
      const source = await repository.createConnectedSource(workspaceId, {
        provider: 'obsidian',
        label:
          label.trim() ||
          (choice === 'new'
            ? t`My knowledge`
            : selectedVault?.name ||
              selectedRoot
                .replace(/[/\\]+$/, '')
                .split(/[/\\]/)
                .pop() ||
              t`My knowledge`),
        root: choice === 'new' ? '' : selectedRoot,
        create_vault: choice === 'new',
        mode,
        configuration: {
          obsidian_connection: choice === 'sync' ? 'headless_sync' : 'local_vault',
          obsidian_sync_mode: syncMode,
        },
      });
      if (choice === 'sync') {
        try {
          await repository.knowledgeSync(workspaceId, source.id, 'start');
        } catch (error) {
          await repository.removeConnectedSource(workspaceId, source.id);
          throw error;
        }
      }
      return source;
    },
    onSettled: () => setEncryptionPassword(''),
    onSuccess: (source) => onConnected(source),
  });
  const choose = (value: ObsidianChoice) => {
    setChoice(value);
    setRoot('');
    setMode(value === 'new' ? 'write_enabled' : 'read_only');
    setEncryptionPassword('');
    connect.reset();
  };
  const error = connect.error || (choice === 'sync' ? vaults.error : undefined);
  const access: SourceAccess = mode === 'write_enabled' ? 'write' : 'read_only';
  const footer = useSourceFrameFooter({
    confirm: {
      label: connect.isPending
        ? choice === 'new'
          ? t`Creating vault…`
          : t`Connecting…`
        : choice === 'new'
          ? t`Create vault`
          : t`Connect vault`,
      disabled:
        connect.isPending ||
        (choice === 'existing' && !root) ||
        (choice === 'sync' && (!vaultId || !account.data?.authenticated)),
    },
    onConfirm: () => connect.mutate(),
    start: onBack
      ? { label: t`Back`, back: true, onClick: onBack, disabled: connect.isPending }
      : undefined,
  });
  return (
    <fieldset disabled={connect.isPending} className="flex min-w-0 flex-col gap-[13px]">
      <ChoiceRows
        label={t`Start`}
        value={choice}
        onChange={choose}
        rows={[
          {
            value: 'new',
            label: t`Create a new vault`,
            detail: t`An empty knowledge vault managed by ${agent}`,
          },
          {
            value: 'existing',
            label: t`Attach an existing vault or folder`,
            detail: t`Notes already on this host. Obsidian is not required`,
          },
          {
            value: 'sync',
            label: t`Sync from Obsidian`,
            detail: t`Sign in and let ${agent} manage a synced copy`,
          },
        ]}
      />
      {choice === 'existing' ? (
        <SourceField
          label={t`Folder`}
          hint={t`On ${hostLabel}. Hidden files and Obsidian settings are excluded.`}
          aside={
            <InfoTip label={t`About attached vaults`}>
              {t`Only this folder is available to knowledge tools. Existing notes and settings stay intact.`}
            </InfoTip>
          }
        >
          <FolderFace path={root}>
            <HostPathPicker
              targetId="local"
              hostLabel={hostLabel}
              label={t`Vault or notes folder`}
              triggerLabel={t`Choose…`}
              triggerClassName={folderTriggerClass}
              startPath={browseStartPath}
              path={root}
              onChoose={setRoot}
              disabled={connect.isPending}
            />
          </FolderFace>
        </SourceField>
      ) : null}
      {choice === 'sync' ? (
        <div className="flex flex-col gap-[13px]">
          <ObsidianAccountSettings />
          {account.data?.authenticated ? (
            <>
              <SourceField label={t`Obsidian Sync vault`} htmlFor={`${id}-vault`}>
                <select
                  id={`${id}-vault`}
                  className={cn(sourceInputClass, 'w-full border bg-background')}
                  value={vaultId}
                  onChange={(event) => setVaultId(event.target.value)}
                >
                  <option value="">
                    {vaults.isPending ? t`Loading vaults…` : t`Choose a vault`}
                  </option>
                  {vaults.data?.vaults.map((vault) => (
                    <option key={vault.id} value={vault.id}>
                      {vault.name}
                    </option>
                  ))}
                </select>
              </SourceField>
              <SourceField
                label={t`Vault encryption password`}
                htmlFor={`${id}-encryption`}
                aside={t`If required`}
              >
                <Input
                  id={`${id}-encryption`}
                  type="password"
                  autoComplete="off"
                  className={sourceInputClass}
                  value={encryptionPassword}
                  onChange={(event) => setEncryptionPassword(event.target.value)}
                />
              </SourceField>
              <SourceField
                label={t`Sync direction`}
                htmlFor={`${id}-direction`}
                hint={t`${agent} keeps a dedicated copy on ${hostLabel}. Direction is separate from editing.`}
              >
                <select
                  id={`${id}-direction`}
                  className={cn(sourceInputClass, 'w-full border bg-background')}
                  value={syncMode}
                  onChange={(event) => setSyncMode(event.target.value as typeof syncMode)}
                >
                  <option value="pull-only">{t`Download remote changes`}</option>
                  <option value="bidirectional">{t`Sync changes both ways`}</option>
                </select>
              </SourceField>
            </>
          ) : null}
        </div>
      ) : null}
      <SourceField
        label={t`Name`}
        htmlFor={`${id}-name`}
        aside="Optional"
        hint={
          choice === 'new'
            ? t`Created on ${hostLabel}. Open the same folder in Obsidian later.`
            : undefined
        }
      >
        <Input
          id={`${id}-name`}
          className={sourceInputClass}
          placeholder={choice === 'new' ? t`My knowledge` : t`The folder or vault name`}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
      </SourceField>
      <AccessRows
        value={access}
        onChange={(next) => setMode(next === 'write' ? 'write_enabled' : 'read_only')}
        unavailable={{ editable: t`Vaults are edited in place` }}
      />
      {error ? (
        <SourceStatusLine role="alert" tone="error" icon={<CircleAlertIcon />}>
          {error.message}
        </SourceStatusLine>
      ) : null}
      {footer}
    </fieldset>
  );
}
