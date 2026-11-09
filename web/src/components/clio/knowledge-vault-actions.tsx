import type { WorkspaceReference } from '@clio/core/v3';
import {
  FileTextIcon,
  FolderIcon,
  LinkIcon,
  NetworkIcon,
  PaperclipIcon,
  PlayIcon,
  SquareIcon,
  UnlinkIcon,
} from 'lucide-react';
import { useContext, useMemo, type ReactNode, type RefObject } from 'react';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import type { useRepository } from '@/hooks/use-repository';
import { copyText } from '@/lib/clipboard';
import { RefreshIcon } from '@/lib/icon-vocabulary';
import { FrameCommentsUnavailable } from './comments/frame-comments';
import { FrameTalkTake } from './file-viewer-take';
import { attempt, useAddToMessage, useOpenTake, type CopyTake } from './file-viewer-take-hooks';
import type { KnowledgeOpened } from './knowledge-note-body';
import { PresentationNavigation } from './presentation-navigation';
import { MenuRow } from './primitives/menu-row';

export type KnowledgeVaultSource = Awaited<
  ReturnType<ReturnType<typeof useRepository>['connectedSources']>
>[number];

export interface KnowledgeVaultMenu {
  mode: string;
  selected: string;
  focus: string;
  setFocus: (path: string) => void;
  isolated: boolean;
  setIsolated: (isolated: boolean) => void;
  attachments: boolean;
  setAttachments: (attachments: boolean) => void;
  refresh: () => void;
  sync?: { running: boolean; pending: boolean; toggle: () => void };
}

/** Talk and Take for a vault: @ and Open once a note is open, Copy ▾ and the vault's … rows. */
export function KnowledgeVaultTake({
  source,
  workspaceId,
  selected,
  opened,
  region,
  menu,
}: {
  source?: KnowledgeVaultSource;
  workspaceId: string;
  selected: string;
  opened?: KnowledgeOpened;
  region: RefObject<Element | null>;
  menu: KnowledgeVaultMenu;
}) {
  const copy = useKnowledgeCopy(source, selected, opened);
  const rows = <KnowledgeVaultMenuRows {...menu} />;
  const comments = <FrameCommentsUnavailable reason="Not available for a vault" />;
  if (opened)
    return (
      <KnowledgeNoteTake
        opened={opened}
        workspaceId={workspaceId}
        region={region}
        comments={comments}
        copy={copy}
        menu={rows}
      />
    );
  return <FrameTalkTake comments={comments} copy={copy} menu={rows} />;
}

function KnowledgeNoteTake({
  opened,
  workspaceId,
  region,
  comments,
  copy,
  menu,
}: {
  opened: KnowledgeOpened;
  workspaceId: string;
  region: RefObject<Element | null>;
  comments: ReactNode;
  copy: CopyTake;
  menu: ReactNode;
}) {
  const navigation = useContext(PresentationNavigation);
  const resource = opened.resource;
  const reference = useMemo<WorkspaceReference>(
    () => ({
      kind: 'resource',
      id: resource.id,
      label: resource.name,
      detail: 'Obsidian knowledge note',
      revision: String(resource.revision),
      media_type: resource.detected_mime,
      navigation: { resource },
    }),
    [resource],
  );
  const addToMessage = useAddToMessage(reference, workspaceId, region);
  const openResource = navigation?.onOpenResource;
  const open = useOpenTake({ kind: 'resource', resource, workspaceId }, [], {
    tab: openResource ? () => openResource(resource) : undefined,
  });
  return (
    <FrameTalkTake
      addToMessage={addToMessage}
      comments={comments}
      copy={copy}
      open={open}
      menu={menu}
    />
  );
}

/** Copy ▾: the note's contents, its path in the vault and the vault's folder. */
function useKnowledgeCopy(
  source: KnowledgeVaultSource | undefined,
  selected: string,
  opened: KnowledgeOpened | undefined,
): CopyTake {
  const folder = source?.local_path || source?.root;
  const copyValue = (value: string, done: string) => void attempt(() => copyText(value), done);
  const contents = () => opened && copyValue(opened.text, 'Copied the contents.');
  const notePath = () => selected && copyValue(selected, 'Copied the note path.');
  const vaultPath = () => folder && copyValue(folder, 'Copied the vault folder path.');
  return {
    rows: [
      {
        id: 'contents',
        label: 'Contents',
        icon: <FileTextIcon />,
        accelerator: 'C',
        reason: opened ? undefined : 'Open a note first',
        onSelect: contents,
      },
      {
        id: 'note',
        label: 'Note path',
        icon: <LinkIcon />,
        accelerator: 'P',
        reason: selected ? undefined : 'Choose a note first',
        onSelect: notePath,
      },
      {
        id: 'vault',
        label: 'Vault folder path',
        icon: <FolderIcon />,
        accelerator: 'V',
        reason: folder ? undefined : 'Vault folder unknown',
        onSelect: vaultPath,
      },
    ],
    face: opened
      ? { label: 'Copy contents', run: contents }
      : selected
        ? { label: 'Copy note path', run: notePath }
        : { label: 'Copy vault folder path', run: vaultPath },
  };
}

function KnowledgeVaultMenuRows({
  mode,
  selected,
  focus,
  setFocus,
  isolated,
  setIsolated,
  attachments,
  setAttachments,
  refresh,
  sync,
}: KnowledgeVaultMenu) {
  return (
    <>
      <DropdownMenuItem onSelect={refresh}>
        <MenuRow icon={<RefreshIcon />} label="Refresh" />
      </DropdownMenuItem>
      {sync ? (
        <DropdownMenuItem disabled={sync.pending} onSelect={sync.toggle}>
          <MenuRow
            icon={sync.running ? <SquareIcon /> : <PlayIcon />}
            label={sync.running ? 'Stop sync' : 'Start sync'}
          />
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={!selected} onSelect={() => setFocus(selected)}>
        <MenuRow
          icon={<NetworkIcon />}
          label="Show its linked notes"
          description={selected ? undefined : 'Choose a note first'}
          checked={Boolean(focus) && focus === selected}
        />
      </DropdownMenuItem>
      <DropdownMenuItem disabled={!focus} onSelect={() => setFocus('')}>
        <MenuRow icon={<FileTextIcon />} label="Show all notes" checked={!focus} />
      </DropdownMenuItem>
      {mode === 'graph' ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setIsolated(!isolated);
            }}
          >
            <MenuRow icon={<UnlinkIcon />} label="Show unlinked notes" checked={isolated} />
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setAttachments(!attachments);
            }}
          >
            <MenuRow icon={<PaperclipIcon />} label="Show attachments" checked={attachments} />
          </DropdownMenuItem>
        </>
      ) : null}
    </>
  );
}
