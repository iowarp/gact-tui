import { CopyPlusIcon, Maximize2Icon, Minimize2Icon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatBytes } from '@/lib/format';
import { DeleteIcon, InfoIcon } from '@/lib/icon-vocabulary';
import { FileCopyDialog } from './file-copy-dialog';
import type { FileViewerAction, FileViewerContentsReader } from './file-viewer-action-context';
import { fileViewerIdentity, type FileViewerSource } from './file-viewer-source';
import { FrameTalkTake } from './file-viewer-take';
import { useCopyTake, useOpenTake, type AddToMessage } from './file-viewer-take-hooks';
import { MenuRow, assignJumpLetters } from './primitives/menu-row';
import { WorkspaceResourceRemoveDialog } from './workspace-resource-remove';

/** Jump letters of the … menu's own rows, and of @, Copy and Open once folded. */
const FIXED_LETTERS = '@COIFWD';

/**
 * The frame bar's Talk and Take for uploads, artifacts and workspace files:
 * @ Add to message, Comments, Copy ▾, Open ▾ and the … menu. As the frame
 * narrows, Open, Copy and @ fold into the … menu in that order.
 */
export function FileViewerActions({
  source,
  fullscreen,
  onFullscreen,
  onInformationHost,
  formatActions,
  hasDocumentActions = false,
  contents,
  addToMessage,
  comments,
}: {
  source: FileViewerSource;
  fullscreen: boolean;
  onFullscreen: () => void;
  onInformationHost: (host: HTMLDivElement | null) => void;
  formatActions: readonly FileViewerAction[];
  hasDocumentActions?: boolean;
  /** What Copy ▾ Contents copies, when the renderer shows text. */
  contents?: FileViewerContentsReader;
  addToMessage?: AddToMessage;
  /** The frame's Comments place. */
  comments?: ReactNode;
}) {
  const [copyOpen, setCopyOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [informationOpen, setInformationOpen] = useState(false);
  const identity = fileViewerIdentity(source);
  const downloadFormats = formatActions.filter((action) => action.kind === 'download');
  const openRows = formatActions.filter((action) => action.kind === 'open');
  const otherActions = formatActions.filter(
    (action) => action.kind !== 'download' && action.kind !== 'open',
  );
  const copy = useCopyTake(source, contents);
  const open = useOpenTake(source, downloadFormats, {
    otherApps: !hasDocumentActions && !openRows.length,
    rows: openRows,
  });
  const canRemove =
    source.kind === 'resource' &&
    ['ready', 'failed', 'quarantined'].includes(source.resource.state);
  const otherLetters = assignJumpLetters(
    otherActions.map((action) => action.label),
    FIXED_LETTERS,
  );
  return (
    <>
      <FrameTalkTake
        addToMessage={addToMessage}
        comments={comments}
        copy={copy}
        open={open}
        menuLabel="File actions"
        menuLetters={FIXED_LETTERS + otherLetters.join('')}
        pending={otherActions.some((action) => action.pending)}
        menu={
          <>
            {otherActions.map(
              (
                {
                  label,
                  description,
                  icon: Icon,
                  onSelect,
                  disabled,
                  kind,
                  selected,
                  pending: actionPending,
                },
                index,
              ) => {
                const letter = otherLetters[index] || undefined;
                const row = (
                  <MenuRow
                    icon={
                      <Icon
                        className={
                          actionPending ? 'animate-spin motion-reduce:animate-none' : undefined
                        }
                      />
                    }
                    label={label}
                    accelerator={letter}
                  />
                );
                return kind === 'view' ? (
                  <DropdownMenuCheckboxItem
                    key={label}
                    data-accelerator={letter}
                    checked={selected}
                    onSelect={onSelect}
                    disabled={disabled}
                    title={description}
                  >
                    {row}
                  </DropdownMenuCheckboxItem>
                ) : (
                  <DropdownMenuItem
                    key={label}
                    data-accelerator={letter}
                    onSelect={onSelect}
                    disabled={disabled}
                    aria-busy={actionPending}
                    title={description}
                  >
                    {row}
                  </DropdownMenuItem>
                );
              },
            )}
            {otherActions.length ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem data-accelerator="I" onSelect={() => setInformationOpen(true)}>
              <MenuRow icon={<InfoIcon />} label="File information" accelerator="I" />
            </DropdownMenuItem>
            <DropdownMenuItem data-accelerator="F" onSelect={onFullscreen}>
              <MenuRow
                icon={fullscreen ? <Minimize2Icon /> : <Maximize2Icon />}
                label={fullscreen ? 'Exit file fullscreen' : 'View file fullscreen'}
                accelerator="F"
              />
            </DropdownMenuItem>
            <DropdownMenuItem
              data-accelerator="W"
              disabled={!identity.available}
              onSelect={() => setCopyOpen(true)}
            >
              <MenuRow icon={<CopyPlusIcon />} label="Copy to another workspace" accelerator="W" />
            </DropdownMenuItem>
            {canRemove ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  data-accelerator="D"
                  variant="destructive"
                  onSelect={() => setRemoveOpen(true)}
                >
                  <MenuRow
                    icon={<DeleteIcon />}
                    label="Remove from this workspace"
                    accelerator="D"
                  />
                </DropdownMenuItem>
              </>
            ) : null}
          </>
        }
      />
      <Dialog open={informationOpen} onOpenChange={setInformationOpen}>
        <DialogContent className="space-y-2">
          <DialogHeader>
            <DialogTitle className="break-words pr-6">{identity.name}</DialogTitle>
            <DialogDescription>
              {identity.origin},{' '}
              {identity.size === undefined ? 'Size unavailable' : formatBytes(identity.size)}
            </DialogDescription>
          </DialogHeader>
          <p className="break-all text-xs text-muted-foreground">{identity.mediaType}</p>
          {source.kind === 'resource' ? (
            <p className="text-xs text-muted-foreground">Upload: {source.resource.state}</p>
          ) : null}
          {source.kind === 'workspace' ? (
            <p className="break-all font-mono text-xs">{source.path}</p>
          ) : null}
          <div className="space-y-1.5" ref={onInformationHost} />
        </DialogContent>
      </Dialog>
      <FileCopyDialog source={source} open={copyOpen} onOpenChange={setCopyOpen} />
      {source.kind === 'resource' ? (
        <WorkspaceResourceRemoveDialog
          resource={source.resource}
          workspaceId={source.workspaceId}
          open={removeOpen}
          onOpenChange={setRemoveOpen}
        />
      ) : null}
    </>
  );
}
