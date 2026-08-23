import { FolderIcon, FolderOpenIcon, KeyboardIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FileTree, FileTreeFile } from '@/components/ai-elements/file-tree';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { inTauri } from '@/lib/transport/tauri-runtime';

export interface PathChoice {
  name: string;
  path: string;
  detail?: string;
}

interface ClioPathPickerProps {
  value: string;
  onChange: (path: string) => void;
  knownFolders?: readonly PathChoice[];
  placeholder?: string;
  disabled?: boolean;
}

/** Selects a local native folder or a folder already exposed by a remote agent service. */
export function ClioPathPicker({
  value,
  onChange,
  knownFolders = [],
  placeholder = 'Choose a folder',
  disabled,
}: ClioPathPickerProps) {
  const [browserOpen, setBrowserOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
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
    <div className="grid gap-2">
      <div className="flex min-w-0 gap-2">
        <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md border bg-muted/20 px-3">
          <FolderIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className={value ? 'truncate text-sm' : 'truncate text-sm text-muted-foreground'}>
            {value || placeholder}
          </span>
        </div>
        <Button
          disabled={disabled}
          onClick={() => void chooseFolder()}
          type="button"
          variant="outline"
        >
          <FolderOpenIcon aria-hidden="true" /> Browse
        </Button>
      </div>
      <Collapsible onOpenChange={setManualOpen} open={manualOpen}>
        <CollapsibleTrigger asChild>
          <Button className="h-7 w-fit px-1.5 text-xs" type="button" variant="ghost">
            <KeyboardIcon aria-hidden="true" className="size-3.5" />
            {manualOpen ? 'Hide path entry' : 'Enter a path instead'}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Input
            aria-label="Folder path"
            className="mt-1 font-mono text-xs"
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Enter a path on the agent service"
            value={value}
          />
        </CollapsibleContent>
      </Collapsible>
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
                    icon={<FolderIcon className="size-4 text-primary" />}
                    key={folder.path}
                    name={folder.name}
                    path={folder.path}
                    title={folder.detail || folder.path}
                  />
                ))}
              </FileTree>
            ) : (
              <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                This service has not exposed any folders yet. Enter a path manually, or use CLIO
                Desktop for native folder browsing.
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
      folders.filter((folder) => folder.path).map((folder) => [folder.path, folder]),
    ).values(),
  ];
}
