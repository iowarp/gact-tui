import type { AgentBlueprintSource, Workspace } from '@clio/core/v3';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HostPathPicker } from './host-path-picker';
import { InfoTip } from './info-tip';
import { vocab } from '@/lib/brand-vocabulary';

export interface MarketplaceSourceInput {
  name: string;
  source: string;
  ref?: string;
  pinned_commit?: string;
  working_checkout?: string;
  scope?: 'global' | 'workspace';
  workspace_id?: string;
}

interface MarketplaceSourceDialogProps {
  open: boolean;
  pending: boolean;
  error?: string;
  workspaces: readonly Workspace[];
  hostLabel: string;
  initial?: AgentBlueprintSource;
  onOpenChange: (open: boolean) => void;
  onAdd: (input: MarketplaceSourceInput) => void;
}

/** Configure a marketplace on the connected host; Save never reloads its runtime. */
export function MarketplaceSourceDialog({
  open,
  pending,
  error,
  workspaces,
  hostLabel,
  initial,
  onOpenChange,
  onAdd,
}: MarketplaceSourceDialogProps) {
  const [kind, setKind] = useState<'repository' | 'folder'>(
    initial?.source_kind === 'path' ? 'folder' : 'repository',
  );
  const [name, setName] = useState(initial?.name ?? '');
  const [source, setSource] = useState(initial?.source ?? '');
  const [sourceRef, setSourceRef] = useState(initial?.ref ?? '');
  const [pin, setPin] = useState(initial?.pinned_commit ?? '');
  const [checkout, setCheckout] = useState(initial?.working_checkout ?? '');
  const [scope, setScope] = useState(
    initial?.install_scope === 'workspace' ? (initial.workspace_id ?? '') : 'global',
  );
  const firstFolder = workspaces[0]?.path ?? '~';
  const validPin = !pin.trim() || /^[a-f\d]{40}$/iu.test(pin.trim());
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-2 pr-6">
            <DialogTitle>
              {initial ? 'Marketplace configuration' : 'Add blueprint marketplace'}
            </DialogTitle>
            {initial ? (
              <InfoTip label="About saving configuration">
                Saving changes the registered source settings. Installed blueprints keep their
                current files until you choose Reload.
              </InfoTip>
            ) : null}
          </div>
          <DialogDescription>
            Connected {vocab.agent} · {hostLabel}
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
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="blueprint-source-kind">Source type</FieldLabel>
              <Select
                onValueChange={(value) => {
                  setKind(value as typeof kind);
                  setSource('');
                  setSourceRef('');
                }}
                value={kind}
              >
                <SelectTrigger id="blueprint-source-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="repository">Repository URL</SelectItem>
                  <SelectItem value="folder">Folder on {vocab.agent}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="blueprint-source-scope">Available in</FieldLabel>
              <Select disabled={Boolean(initial)} onValueChange={setScope} value={scope}>
                <SelectTrigger id="blueprint-source-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">All workspaces</SelectItem>
                  {workspaces.map((workspace) => (
                    <SelectItem key={workspace.id} value={workspace.id}>
                      {workspace.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="blueprint-source-location">
              {kind === 'repository' ? 'Repository URL' : 'Marketplace folder'}
            </FieldLabel>
            <div className="flex gap-2">
              <Input
                id="blueprint-source-location"
                className="min-w-0"
                onChange={(event) => setSource(event.target.value)}
                placeholder={
                  kind === 'repository'
                    ? 'https://github.com/organization/marketplace'
                    : `Absolute path on this ${vocab.agent}`
                }
                value={source}
              />
              {kind === 'folder' ? (
                <HostPathPicker
                  targetId="local"
                  hostLabel={hostLabel}
                  label="Marketplace folder"
                  path={source || firstFolder}
                  onChoose={setSource}
                />
              ) : null}
            </div>
          </Field>
          {kind === 'repository' ? (
            <Field>
              <FieldLabel htmlFor="blueprint-source-ref">Branch or tag</FieldLabel>
              <Input
                id="blueprint-source-ref"
                onChange={(event) => setSourceRef(event.target.value)}
                placeholder="Repository default"
                value={sourceRef}
              />
            </Field>
          ) : null}
          <details open={Boolean(pin || checkout)} className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Revision and authoring</summary>
            <div className="mt-4 grid gap-4">
              <Field>
                <div className="flex items-center gap-2">
                  <FieldLabel htmlFor="blueprint-source-pin">Pinned commit</FieldLabel>
                  <InfoTip label="About pinned revisions">
                    Keep this exact revision until you change or clear the pin and choose Reload.
                    Checking for updates never changes it.
                  </InfoTip>
                </div>
                <Input
                  id="blueprint-source-pin"
                  onChange={(event) => setPin(event.target.value)}
                  placeholder="Optional full commit hash"
                  value={pin}
                  aria-invalid={!validPin}
                />
                {!validPin ? (
                  <p className="text-xs text-destructive">
                    Enter all 40 characters of the commit hash.
                  </p>
                ) : null}
              </Field>
              <Field>
                <div className="flex items-center gap-2">
                  <FieldLabel htmlFor="blueprint-working-checkout">Working checkout</FieldLabel>
                  <InfoTip label="About working checkouts">
                    An editable copy on {hostLabel}. Save draft keeps your edits on this host.
                    Publish writes selected edits here. Reload applies the configured source
                    revision to sessions at a safe turn boundary.
                  </InfoTip>
                </div>
                <div className="flex gap-2">
                  <Input
                    className="min-w-0"
                    id="blueprint-working-checkout"
                    onChange={(event) => setCheckout(event.target.value)}
                    placeholder="Optional folder for publishing edits"
                    value={checkout}
                  />
                  <HostPathPicker
                    targetId="local"
                    hostLabel={hostLabel}
                    label="Working checkout"
                    path={checkout || firstFolder}
                    onChoose={setCheckout}
                  />
                </div>
              </Field>
            </div>
          </details>
        </FieldGroup>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button disabled={pending} onClick={() => onOpenChange(false)} variant="outline">
            Cancel
          </Button>
          <Button
            disabled={!source.trim() || !scope || !validPin || pending}
            onClick={() =>
              onAdd({
                name: name.trim() || source.trim(),
                source: source.trim(),
                ref: sourceRef.trim(),
                pinned_commit: pin.trim(),
                working_checkout: checkout.trim(),
                scope: scope === 'global' ? 'global' : 'workspace',
                workspace_id: scope === 'global' ? undefined : scope,
              })
            }
          >
            {pending
              ? initial
                ? 'Saving…'
                : 'Adding…'
              : initial
                ? 'Save configuration'
                : 'Add marketplace'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
