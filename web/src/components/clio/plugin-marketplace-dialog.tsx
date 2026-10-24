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
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { vocab } from '@/lib/brand-vocabulary';

export interface PluginMarketplaceInput {
  source: string;
  ref?: string;
  commit?: string;
  name?: string;
}

/**
 * Install a marketplace by its source: a git repository or a folder on the
 * service's host. A marketplace that is not shipped with the service loads its
 * plugins only after the explicit trust step.
 */
export function PluginMarketplaceDialog({
  open,
  pending,
  error,
  onOpenChange,
  onInstall,
}: {
  open: boolean;
  pending: boolean;
  error?: string;
  onOpenChange: (open: boolean) => void;
  onInstall: (input: PluginMarketplaceInput) => void;
}) {
  const [source, setSource] = useState('');
  const [ref, setRef] = useState('');
  const [commit, setCommit] = useState('');
  const [name, setName] = useState('');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Install a marketplace</DialogTitle>
          <DialogDescription>
            Plugin marketplaces in the Agent Plugins or Claude Code format are both supported. The{' '}
            {vocab.agent} fetches the source; you trust it in the next step.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!source.trim()) return;
            onInstall({
              source: source.trim(),
              ref: ref.trim() || undefined,
              commit: commit.trim() || undefined,
              name: name.trim() || undefined,
            });
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="marketplace-source">Source</FieldLabel>
              <Input
                autoFocus
                id="marketplace-source"
                onChange={(event) => setSource(event.target.value)}
                placeholder="https://github.com/org/marketplace.git"
                value={source}
              />
              <FieldDescription>
                A git repository URL or a folder on the service&apos;s host.
              </FieldDescription>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="marketplace-ref">Branch or tag</FieldLabel>
                <Input
                  id="marketplace-ref"
                  onChange={(event) => setRef(event.target.value)}
                  placeholder="Default branch"
                  value={ref}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="marketplace-commit">Pinned commit</FieldLabel>
                <Input
                  id="marketplace-commit"
                  onChange={(event) => setCommit(event.target.value)}
                  placeholder="Latest"
                  value={commit}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="marketplace-name">Name</FieldLabel>
              <Input
                id="marketplace-name"
                onChange={(event) => setName(event.target.value)}
                placeholder="From the marketplace"
                value={name}
              />
            </Field>
          </FieldGroup>
          {error ? (
            <p className="whitespace-pre-wrap text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={!source.trim() || pending} type="submit">
              {pending ? 'Installing…' : 'Install'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
