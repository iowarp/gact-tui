import { useId, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { ConnectedSourceState, SourceMode } from '@clio/core/v3';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { vocab } from '@/lib/brand-vocabulary';
import { SourceProviderLogo } from './source-provider-logo';
import { ChosenFolder, ConnectField, ConnectInput } from './connect-frame';
import { HostPathPicker } from './host-path-picker';
import { ObsidianIntroduction } from './obsidian-introduction';
import { ObsidianAccountSettings } from './obsidian-account-settings';
import { ObsidianSyncDirection, type ObsidianSyncMode } from './obsidian-sync-direction';
import { SourceAccessChoice } from './source-access-choice';
import { vaultModes, vaultReasons } from './connected-source-labels';

export type ObsidianChoice = 'new' | 'existing' | 'sync';

/** Explicit vault creation and attachment share the same Obsidian knowledge semantics. */
type ObsidianSourceFormProps = {
  workspaceId: string;
  hostLabel: string;
  browseStartPath?: string;
  initialChoice?: ObsidianChoice;
  onConnected: (source: ConnectedSourceState) => void;
  onBack: () => void;
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
  const [syncMode, setSyncMode] = useState<ObsidianSyncMode>('pull-only');
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
            ? 'My knowledge'
            : selectedVault?.name ||
              selectedRoot
                .replace(/[/\\]+$/, '')
                .split(/[/\\]/)
                .pop() ||
              'My knowledge'),
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
  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-3">
        <SourceProviderLogo provider="obsidian" />
        <h3 className="font-medium">Obsidian knowledge source</h3>
      </div>
      <ObsidianIntroduction />
      <fieldset disabled={connect.isPending} className="grid gap-4">
        <legend className="mb-2 text-sm font-medium">Choose how to start</legend>
        <RadioGroup
          className="grid gap-2"
          aria-label="Vault setup"
          value={choice}
          onValueChange={(value) => choose(value as ObsidianChoice)}
        >
          {(
            [
              [
                'new',
                'Create a new vault',
                `Start an empty knowledge vault managed by ${vocab.agent}.`,
              ],
              [
                'existing',
                'Attach an existing vault or folder',
                'Use notes already on this host. Obsidian is not required.',
              ],
              [
                'sync',
                'Sync from Obsidian',
                `Sign in and let ${vocab.agent} manage a synced copy.`,
              ],
            ] as const
          ).map(([value, title, detail]) => (
            <label
              key={value}
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${choice === value ? 'border-primary bg-primary/5' : ''}`}
            >
              <RadioGroupItem
                value={value}
                className="mt-1"
                aria-label={title}
                disabled={connect.isPending}
              />
              <span>
                <span className="block text-sm font-medium">{title}</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
        <ConnectField htmlFor={`${id}-name`} label="Vault name" optional>
          <ConnectInput
            id={`${id}-name`}
            placeholder={choice === 'new' ? 'My knowledge' : 'Use the folder or vault name'}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </ConnectField>
        {choice === 'new' ? (
          <p className="text-sm leading-6 text-muted-foreground">
            {vocab.agent} creates an empty vault on {hostLabel}. You can add notes and follow their
            links here, and open the same folder in Obsidian later.
          </p>
        ) : choice === 'existing' ? (
          <ConnectField label={`Vault or notes folder on ${hostLabel}`}>
            <div className="flex min-w-0 items-center gap-2">
              <HostPathPicker
                targetId="local"
                hostLabel={hostLabel}
                label="Vault or notes folder"
                triggerLabel="Choose folder"
                startPath={browseStartPath}
                path={root}
                onChoose={setRoot}
                disabled={connect.isPending}
              />
              <ChosenFolder path={root} />
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Only this folder is available to knowledge tools. Existing notes and settings stay
              intact; hidden files and Obsidian settings are excluded.
            </p>
          </ConnectField>
        ) : (
          <div className="grid gap-4">
            <ObsidianAccountSettings />
            {account.data?.authenticated ? (
              <>
                <ConnectField htmlFor={`${id}-vault`} label="Obsidian Sync vault">
                  <select
                    id={`${id}-vault`}
                    className="h-[30px] w-full min-w-0 rounded-[7px] border border-input bg-transparent px-2 text-[12.5px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-sidebar"
                    value={vaultId}
                    onChange={(event) => setVaultId(event.target.value)}
                  >
                    <option value="">
                      {vaults.isPending ? 'Loading vaults…' : 'Choose a vault'}
                    </option>
                    {vaults.data?.vaults.map((vault) => (
                      <option key={vault.id} value={vault.id}>
                        {vault.name}
                      </option>
                    ))}
                  </select>
                </ConnectField>
                <ConnectField
                  htmlFor={`${id}-encryption`}
                  label="Vault encryption password, if required"
                >
                  <ConnectInput
                    id={`${id}-encryption`}
                    type="password"
                    autoComplete="off"
                    value={encryptionPassword}
                    onChange={(event) => setEncryptionPassword(event.target.value)}
                  />
                </ConnectField>
                <ConnectField htmlFor={`${id}-direction`} label="Sync direction">
                  <ObsidianSyncDirection
                    id={`${id}-direction`}
                    value={syncMode}
                    onChange={setSyncMode}
                  />
                </ConnectField>
                <p className="text-xs leading-5 text-muted-foreground">
                  {vocab.agent} stores and manages a dedicated copy on {hostLabel}. Sync direction
                  is separate from permission to edit notes.
                </p>
              </>
            ) : null}
          </div>
        )}
        <SourceAccessChoice
          value={mode}
          onChange={setMode}
          supported={vaultModes}
          reasons={vaultReasons}
          disabled={connect.isPending}
        />
      </fieldset>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      ) : null}
      <div className="flex justify-between gap-2">
        <Button type="button" variant="ghost" disabled={connect.isPending} onClick={onBack}>
          Back
        </Button>
        <Button
          type="button"
          disabled={
            connect.isPending ||
            (choice === 'existing' && !root) ||
            (choice === 'sync' && (!vaultId || !account.data?.authenticated))
          }
          onClick={() => connect.mutate()}
        >
          {connect.isPending
            ? choice === 'new'
              ? 'Creating vault…'
              : 'Connecting…'
            : choice === 'new'
              ? 'Create vault'
              : 'Connect vault'}
        </Button>
      </div>
    </div>
  );
}
