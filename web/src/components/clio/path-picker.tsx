import { FolderIcon, FolderOpenIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  FileTree,
  FileTreeFile,
  FileTreeIcon,
  FileTreeName,
} from '@/components/ai-elements/file-tree';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { vocab } from '@/lib/brand-vocabulary';
import { inTauri } from '@/lib/transport/tauri-runtime';

export interface PathChoice {
  name: string;
  path: string;
  detail?: string;
  qualifiers?: readonly string[];
}

interface ClioPathPickerProps {
  value: string;
  onChange: (path: string) => void;
  knownFolders?: readonly PathChoice[];
  placeholder?: string;
  disabled?: boolean;
  inputLabel?: string;
}

/** Edit one folder path directly or choose it with the service/native picker. */
export function ClioPathPicker({
  value,
  onChange,
  knownFolders = [],
  placeholder = 'Type, paste, or browse for a folder',
  disabled,
  inputLabel = 'Folder path',
}: ClioPathPickerProps) {
  const [browserOpen, setBrowserOpen] = useState(false);
  const [candidate, setCandidate] = useState(value);
  const folders = useMemo(() => uniqueFolders(knownFolders), [knownFolders]);

  const chooseFolder = async () => {
    if (inTauri()) {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === 'string') onChange(selected);
      return;
    }
    setCandidate(value);
    setBrowserOpen(true);
  };

  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex min-w-0 gap-2">
        <InputGroup className="min-w-0 flex-1">
          <InputGroupAddon>
            <FolderIcon aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            aria-label={inputLabel}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            title={value || undefined}
            value={value}
          />
        </InputGroup>
        <Button
          disabled={disabled}
          onClick={() => void chooseFolder()}
          type="button"
          variant="outline"
        >
          <FolderOpenIcon aria-hidden="true" /> Browse
        </Button>
      </div>
      <Dialog onOpenChange={setBrowserOpen} open={browserOpen}>
        <DialogContent className="grid max-h-[min(620px,calc(100dvh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Choose a folder</DialogTitle>
            <DialogDescription>
              Select a folder this agent service already exposes. Desktop can browse any local
              folder through the native picker.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="min-h-0 pr-3">
            {folders.length ? (
              <FileTree onSelect={setCandidate} selectedPath={candidate}>
                {folders.map((folder) => (
                  <FileTreeFile
                    key={folder.path}
                    name={folder.name}
                    path={folder.path}
                    title={folder.detail || folder.path}
                  >
                    <FileTreeIcon>
                      <FolderIcon className="size-4 text-primary" />
                    </FileTreeIcon>
                    <FileTreeName>{folder.name}</FileTreeName>
                    {folder.qualifiers?.map((qualifier) => (
                      <span className="shrink-0 text-xs text-muted-foreground" key={qualifier}>
                        {qualifier}
                      </span>
                    ))}
                  </FileTreeFile>
                ))}
              </FileTree>
            ) : (
              <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                This service has not exposed any folders yet. Enter a path manually, or use{' '}
                {vocab.product} for native folder browsing.
              </div>
            )}
          </ScrollArea>
          <DialogFooter>
            <Button onClick={() => setBrowserOpen(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={!candidate}
              onClick={() => {
                onChange(candidate);
                setBrowserOpen(false);
              }}
              type="button"
            >
              Use this folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function uniqueFolders(folders: readonly PathChoice[]): PathChoice[] {
  return [
    ...new Map(
      folders
        .filter((folder) => folder.path)
        .map((folder) => [folderIdentity(folder.path), folder]),
    ).values(),
  ];
}

function folderIdentity(path: string): string {
  return path.replaceAll('\\', '/').replace(/\/+$/u, '').toLocaleLowerCase();
}
