import { workspaceName } from '@/lib/workspace-labels';
import type { Workspace, WorkspaceSourceFolder } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CopyIcon, FolderIcon, LockIcon } from 'lucide-react';
import { useContext, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useRepository } from '@/hooks/use-repository';
import { InfoIcon, RemoveIcon } from '@/lib/icon-vocabulary';
import { queryKeys } from '@/lib/query-keys';
import { QUERY_STALE_TIME_MS } from '@/lib/runtime-limits';
import { ROW_STATE_WRAP, SETTINGS_COLUMN } from '@/lib/settings-fold';
import { SettingsScopeContext } from '@/lib/settings-scope-context';
import { workspaceScopeLine } from '@/lib/settings-workspace-name';
import { useConnectionSettings } from '@/providers/connection-provider';
import { SettingsSelectField } from './model-select-field';
import { IconButton } from './primitives/icon-button';
import { ItemList, ItemRow } from './primitives/item-row';
import { SaveBar } from './primitives/save-bar';
import { StateView } from './primitives/state-view';
import { useFolderGrants } from './sandbox-boundary-grants';
import { ColourSwatches, IconSelect } from './settings-folders-appearance';
import { AllowFolderDialog, ChangePrimaryDialog } from './settings-folders-dialogs';
import { useWorkspaceAppearance, workspaceFolders } from './settings-folders-model';
import { SettingsGroupLabel, SettingsRow } from './settings-row';
import { SettingsSectionHeading } from './settings-section-heading';

const ACTIONS_WIDTH = 60;
const SLOT_WIDTH = 84;

const errorText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason));

/**
 * Folders (Workspace group): the current workspace's name, colour and icon, its
 * primary folder, and the other folders its commands may write.
 */
export function FoldersSettings({ initialWorkspaceId }: { initialWorkspaceId?: string }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [pickedId, setPickedId] = useState<string>();
  // The list the workspace's folder bar reads, so a grant made anywhere refreshes both.
  const workspaces = useQuery({
    queryKey: queryKeys.key('workspaces', settings.endpoint),
    queryFn: ({ signal }) => repository.workspaces(signal),
    staleTime: QUERY_STALE_TIME_MS,
  });
  const list = workspaces.data ?? [];
  const workspaceId = pickedId ?? (initialWorkspaceId || list[0]?.id);
  const workspace = list.find((item) => item.id === workspaceId);
  const picker = !initialWorkspaceId && list.length > 1;
  const pageScope = useContext(SettingsScopeContext);
  // Opened on its own, the page picks its workspace, and the scope line names that one.
  const scope =
    pageScope && workspace
      ? {
          ...pageScope,
          line: workspaceScopeLine(workspaceName(workspace)),
          place: workspaceName(workspace),
        }
      : pageScope;

  let body: ReactNode;
  if (workspaces.isPending) {
    body = <StateView kind="loading" size="row" title="Loading folders…" />;
  } else if (workspaces.isError) {
    body = (
      <StateView
        action={{ label: 'Retry', onClick: () => void workspaces.refetch() }}
        className={ROW_STATE_WRAP}
        kind="error"
        size="row"
        title={
          workspaces.isFetching ? 'Trying again…' : 'This workspace’s folders could not be loaded.'
        }
      />
    );
  } else if (!workspace) {
    body = (
      <StateView
        kind="unavailable"
        size="row"
        title={list.length ? 'This workspace is no longer available.' : 'No workspaces yet.'}
      />
    );
  } else {
    body = <WorkspaceFolders key={workspace.id} workspace={workspace} />;
  }

  return (
    <SettingsScopeContext.Provider value={scope}>
      <div className="min-w-0" data-slot="folders-settings">
        <SettingsSectionHeading
          info="Where this workspace’s conversations start and which other folders their commands may change. Colour and icon are kept on this device."
          title="Folders"
        />
        {picker ? (
          <SettingsRow htmlFor="folders-workspace" title="Workspace">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SettingsSelectField
                  icon={<FolderIcon />}
                  id="folders-workspace"
                  placeholder="Choose a workspace"
                  title={workspace?.path}
                  value={workspace ? workspaceName(workspace) : undefined}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-w-80">
                <DropdownMenuRadioGroup onValueChange={setPickedId} value={workspaceId}>
                  {list.map((item) => (
                    <DropdownMenuRadioItem key={item.id} title={item.path} value={item.id}>
                      <span className="truncate">{workspaceName(item)}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SettingsRow>
        ) : null}
        {body}
      </div>
    </SettingsScopeContext.Provider>
  );
}

interface Draft {
  name?: string;
  colour?: string;
  icon?: string;
}

function FolderTitle({ folder }: { folder: WorkspaceSourceFolder }) {
  return (
    <span className="font-mono text-[0.78125rem] font-normal" title={folder.path}>
      {folder.path}
    </span>
  );
}

function WorkspaceFolders({ workspace }: { workspace: Workspace }) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const { appearance, save: saveAppearance } = useWorkspaceAppearance(
    settings.endpoint,
    workspace.id,
  );
  const { primary, additional } = workspaceFolders(workspace);
  const granted = useFolderGrants(
    workspace.id,
    additional.map((folder) => folder.path),
  );
  const [draft, setDraft] = useState<Draft>({});
  const [allowOpen, setAllowOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  // Each opening mounts a fresh dialog, so its field starts from the current folders.
  const [opening, setOpening] = useState(0);
  const openAllow = () => {
    setOpening((count) => count + 1);
    setAllowOpen(true);
  };
  const openChange = () => {
    setOpening((count) => count + 1);
    setChangeOpen(true);
  };
  const [removing, setRemoving] = useState<string[]>([]);

  const name = draft.name ?? workspace.display_name;
  const colour = draft.colour ?? appearance.colour;
  const icon = draft.icon ?? appearance.icon;
  const nameDirty = draft.name !== undefined && draft.name.trim() !== workspace.display_name;
  const colourDirty = draft.colour !== undefined && draft.colour !== appearance.colour;
  const iconDirty = draft.icon !== undefined && draft.icon !== appearance.icon;
  const count = [nameDirty, colourDirty, iconDirty].filter(Boolean).length;

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.key('workspaces', settings.endpoint) }),
      queryClient.invalidateQueries({
        predicate: ({ queryKey }) =>
          typeof queryKey[0] === 'string' &&
          queryKey[0].startsWith('workspace-') &&
          queryKey.includes(settings.endpoint) &&
          queryKey.includes(workspace.id),
      }),
    ]);

  const save = useMutation({
    mutationFn: async () => {
      if (colourDirty || iconDirty) {
        saveAppearance({ colour, icon });
        setDraft((current) => ({ name: current.name }));
      }
      if (nameDirty) {
        await repository.updateWorkspace(workspace.id, { name: name.trim() });
        await refresh();
      }
    },
    onSuccess: () => setDraft({}),
  });

  const allow = async (path: string) => {
    await repository.grantWorkspaceFolder(workspace.id, path);
    await refresh();
  };
  const changePrimary = async (path: string) => {
    await repository.updateWorkspace(workspace.id, {
      name: workspace.display_name,
      root_path: path,
    });
    await refresh();
  };
  const remove = async (folder: WorkspaceSourceFolder) => {
    setRemoving((current) => [...current, folder.path]);
    try {
      await repository.revokeWorkspaceFolder(workspace.id, folder.path);
      await refresh();
      toast.success(`Removed ${folder.name}`, {
        description: 'Its files are untouched.',
        action: {
          label: 'Undo',
          onClick: () =>
            void allow(folder.path).catch((reason: unknown) =>
              toast.error(`Could not allow ${folder.name} again`, {
                description: errorText(reason),
              }),
            ),
        },
      });
    } catch (reason) {
      toast.error(`Could not remove ${folder.name}`, { description: errorText(reason) });
    } finally {
      setRemoving((current) => current.filter((path) => path !== folder.path));
    }
  };
  const copyAction = (folder: WorkspaceSourceFolder) => (
    <IconButton
      icon={<CopyIcon />}
      label={`Copy path of ${folder.name}`}
      onClick={() =>
        void navigator.clipboard
          ?.writeText(folder.path)
          .then(() => toast.success('Folder path copied', { description: folder.path }))
      }
    />
  );

  return (
    <div className="min-w-0">
      <SettingsRow dirty={nameDirty} htmlFor="folders-name" title="Name">
        <Input
          aria-invalid={nameDirty && !name.trim() ? true : undefined}
          className="h-[1.875rem] w-full text-[0.78125rem] md:text-[0.78125rem]"
          disabled={save.isPending}
          id="folders-name"
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          title={name}
          value={name}
        />
      </SettingsRow>
      <SettingsRow dirty={colourDirty} title="Colour">
        <ColourSwatches
          disabled={save.isPending}
          onChange={(next) => setDraft((current) => ({ ...current, colour: next }))}
          value={colour}
        />
      </SettingsRow>
      <SettingsRow dirty={iconDirty} htmlFor="folders-icon" title="Icon">
        <IconSelect
          disabled={save.isPending}
          id="folders-icon"
          onChange={(next) => setDraft((current) => ({ ...current, icon: next }))}
          value={icon}
        />
      </SettingsRow>

      {/* Item lists share the setting rows' column (spec `.xrw`), so right edges meet. */}
      <div className={SETTINGS_COLUMN} data-slot="folders-lists">
        <SettingsGroupLabel info="Conversations start here. Changing it never moves files.">
          Primary folder
        </SettingsGroupLabel>
        <ItemList label="Primary folder">
          <ItemRow
            actions={copyAction(primary)}
            actionsWidth={ACTIONS_WIDTH}
            icon={<FolderIcon />}
            meta="Workspace folder"
            slot={
              <Button onClick={openChange} size="sm" variant="outline">
                Change
              </Button>
            }
            slotWidth={SLOT_WIDTH}
            title={<FolderTitle folder={primary} />}
          />
        </ItemList>

        <SettingsGroupLabel
          addLabel="Add folder"
          info="Commands may create, change and delete files in these folders too. Removing one revokes access and deletes nothing."
          onAdd={openAllow}
        >
          Additional folders
        </SettingsGroupLabel>
        <ItemList label="Additional folders">
          {additional.length ? (
            additional.map((folder) => {
              const fromSandbox = granted[folder.path] === 'granted';
              const busy = removing.includes(folder.path);
              const words = busy
                ? 'Removing…'
                : fromSandbox
                  ? 'Allowed by you from a sandbox block'
                  : 'Read and write';
              return (
                <ItemRow
                  actions={
                    <>
                      {copyAction(folder)}
                      <IconButton
                        disabled={busy}
                        icon={<RemoveIcon />}
                        label={`Remove ${folder.name}`}
                        onClick={() => void remove(folder)}
                      />
                    </>
                  }
                  actionsWidth={ACTIONS_WIDTH}
                  data-source={fromSandbox ? 'sandbox' : undefined}
                  icon={fromSandbox ? <LockIcon /> : <FolderIcon />}
                  key={folder.path}
                  meta={words}
                  title={<FolderTitle folder={folder} />}
                />
              );
            })
          ) : (
            <StateView
              className={ROW_STATE_WRAP}
              kind="empty"
              size="row"
              title="No additional folders. Commands write only in the primary folder."
            />
          )}
        </ItemList>
        <p
          className="flex h-[1.875rem] min-w-0 items-center gap-2 text-xs whitespace-nowrap text-faint"
          data-slot="folders-note"
        >
          <InfoIcon aria-hidden="true" className="size-[0.8125rem] shrink-0" />
          <span className="min-w-0 truncate">
            Running tools pick up folder changes when they finish.
          </span>
        </p>
      </div>

      <SaveBar
        count={count}
        error={save.error ? errorText(save.error) : undefined}
        invalid={nameDirty && !name.trim()}
        onDiscard={() => {
          save.reset();
          setDraft({});
        }}
        onSave={() => save.mutate()}
        saving={save.isPending}
      />
      <AllowFolderDialog
        key={`allow-${opening}`}
        additional={additional}
        onAllow={allow}
        onOpenChange={setAllowOpen}
        open={allowOpen}
        primary={primary.path}
      />
      <ChangePrimaryDialog
        key={`change-${opening}`}
        current={primary.path}
        onChange={changePrimary}
        onOpenChange={setChangeOpen}
        open={changeOpen}
      />
    </div>
  );
}
