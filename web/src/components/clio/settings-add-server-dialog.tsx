import { LoaderCircleIcon } from 'lucide-react';
import { AddIcon } from '@/lib/icon-vocabulary';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useSavedServers } from '@/hooks/use-saved-servers';
import { normalizeServerAddress, savedCheckSentence } from '@/lib/local-servers';

/**
 * Add a self-hosted server -- any OpenAI-compatible address (a vLLM or
 * llama.cpp on a cluster node or another machine). One short dialog: a name,
 * an address, Add. The service saves it and checks it at once; the dialog
 * ends on what the check found.
 */
export function SettingsAddServerDialog() {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [draft, setDraft] = useState('');
  const { save } = useSavedServers();
  const address = normalizeServerAddress(draft);
  const added = save.data;

  function reset(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setLabel('');
      setDraft('');
      save.reset();
    }
  }

  return (
    <Dialog onOpenChange={reset} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          <AddIcon data-icon="inline-start" />
          Add a server
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" data-slot="add-server-dialog">
        <DialogHeader>
          <DialogTitle>Add a server</DialogTitle>
          <DialogDescription>
            A model server on another machine or a cluster node, reached by its address.
          </DialogDescription>
        </DialogHeader>
        {added ? (
          <p className="text-sm" data-slot="add-server-result" role="status">
            {added.label} was added. {savedCheckSentence(added.check)}
          </p>
        ) : (
          <form
            className="grid gap-2"
            id="add-server-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (address) save.mutate({ address, label: label.trim() || undefined });
            }}
          >
            <Input
              aria-label="Server name"
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Name (optional)"
              value={label}
            />
            <Input
              aria-label="Server address"
              autoComplete="url"
              autoFocus
              className="font-mono text-sm"
              onChange={(event) => setDraft(event.target.value)}
              placeholder="http://my-server:8000/v1"
              value={draft}
            />
            {save.isPending ? (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground" role="status">
                <LoaderCircleIcon aria-hidden="true" className="size-4 animate-spin" />
                Adding and checking…
              </p>
            ) : save.error ? (
              <p className="text-sm text-destructive" role="alert">
                {save.error.message}
              </p>
            ) : null}
          </form>
        )}
        <DialogFooter>
          {added ? (
            <Button onClick={() => reset(false)} type="button">
              Done
            </Button>
          ) : (
            <Button disabled={!address || save.isPending} form="add-server-form" type="submit">
              Add
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
