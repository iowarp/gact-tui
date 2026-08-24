import type { Workspace } from '@clio/core/v3';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ClioPathPicker, type PathChoice } from './path-picker';

export interface MarketplaceSourceInput {
  name: string;
  source: string;
  ref?: string;
}

interface MarketplaceSourceDialogProps {
  open: boolean;
  pending: boolean;
  error?: string;
  workspaces: readonly Workspace[];
  onOpenChange: (open: boolean) => void;
  onAdd: (input: MarketplaceSourceInput) => void;
}

/** Adds a remote repository or browsable agent-side folder as a blueprint marketplace. */
export function MarketplaceSourceDialog({
  open,
  pending,
  error,
  workspaces,
  onOpenChange,
  onAdd,
}: MarketplaceSourceDialogProps) {
  const [kind, setKind] = useState<'repository' | 'folder'>('repository');
  const [name, setName] = useState('');
  const [source, setSource] = useState('');
  const [sourceRef, setSourceRef] = useState('');
  const knownFolders = useMemo(() => workspaceFolderChoices(workspaces), [workspaces]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add blueprint marketplace</DialogTitle>
          <DialogDescription>
            Connect a repository, or choose a folder already available to this agent.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="blueprint-source-name">Name</FieldLabel>
            <Input
              id="blueprint-source-name"
              onChange={(event) => setName(event.target.value)}
              placeholder="Scientific marketplace"
              value={name}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="blueprint-source-kind">Source type</FieldLabel>
            <Select
              onValueChange={(value) => {
                setKind(value as typeof kind);
                setSource('');
              }}
              value={kind}
            >
              <SelectTrigger id="blueprint-source-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="repository">Repository URL</SelectItem>
                <SelectItem value="folder">Folder on agent</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {kind === 'repository' ? (
            <Field>
              <FieldLabel htmlFor="blueprint-source-location">Repository URL</FieldLabel>
              <Input
                id="blueprint-source-location"
                onChange={(event) => setSource(event.target.value)}
                placeholder="https://example.org/organization/marketplace"
                value={source}
              />
              <FieldDescription>The connected agent validates and refreshes it.</FieldDescription>
            </Field>
          ) : (
            <Field>
              <FieldLabel>Marketplace folder</FieldLabel>
              <ClioPathPicker
                knownFolders={knownFolders}
                onChange={setSource}
                placeholder="Choose a marketplace folder"
                value={source}
              />
            </Field>
          )}
          {kind === 'repository' ? (
            <Field>
              <FieldLabel htmlFor="blueprint-source-ref">Branch or tag</FieldLabel>
              <Input
                id="blueprint-source-ref"
                onChange={(event) => setSourceRef(event.target.value)}
                placeholder="main"
                value={sourceRef}
              />
            </Field>
          ) : null}
        </FieldGroup>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Cancel
          </Button>
          <Button
            disabled={!source.trim() || pending}
            onClick={() =>
              onAdd({
                name: name.trim() || source.trim(),
                source: source.trim(),
                ref: kind === 'repository' ? sourceRef.trim() || undefined : undefined,
              })
            }
          >
            {pending ? 'Adding…' : 'Add marketplace'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function workspaceFolderChoices(workspaces: readonly Workspace[]): PathChoice[] {
  const choices = workspaces.flatMap((workspace) =>
    workspace.source_folders?.length
      ? workspace.source_folders.map((folder) => ({
          name: folder.name,
          path: folder.path,
          detail: `${workspace.display_name}: ${folder.path}`,
          workspaceName: workspace.display_name,
        }))
      : [
          {
            name: workspace.display_name,
            path: workspace.path,
            detail: workspace.path,
            workspaceName: workspace.display_name,
          },
        ],
  );
  const uniqueChoices = [
    ...new Map(choices.map((choice) => [pathIdentity(choice.path), choice])).values(),
  ];
  const nameCounts = new Map<string, number>();
  for (const choice of uniqueChoices) {
    nameCounts.set(choice.name, (nameCounts.get(choice.name) ?? 0) + 1);
  }
  return uniqueChoices.map(({ workspaceName, ...choice }) => ({
    ...choice,
    name:
      (nameCounts.get(choice.name) ?? 0) > 1
        ? `${choice.name} — ${workspaceName || parentName(choice.path)}`
        : choice.name,
  }));
}

function pathIdentity(path: string): string {
  return path.replaceAll('\\', '/').replace(/\/+$/u, '').toLocaleLowerCase();
}

function parentName(path: string): string {
  const parts = path.split(/[\\/]/u).filter(Boolean);
  return parts.at(-2) ?? 'another location';
}
