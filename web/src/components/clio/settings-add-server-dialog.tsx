import { LoaderCircleIcon, PlusIcon } from 'lucide-react';
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
import { useServerCheck } from '@/hooks/use-server-check';
import { CUSTOM_SERVER_PRESET_ID, normalizeServerAddress } from '@/lib/local-servers';

interface SettingsAddServerDialogProps {
  applying: boolean;
  /** Make the checked server the default, with the first model it serves. */
  onUse: (address: string, model: string | undefined) => void;
}

/**
 * Add a self-hosted server -- any OpenAI-compatible address (a vLLM or
 * llama.cpp on a cluster node or another machine): type the address, check
 * it live, then use it. One short dialog, one field.
 */
export function SettingsAddServerDialog({ applying, onUse }: SettingsAddServerDialogProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const check = useServerCheck(CUSTOM_SERVER_PRESET_ID);
  const address = normalizeServerAddress(draft);
  const found = check.data;

  function reset(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setDraft('');
      check.reset();
    }
  }

  return (
    <Dialog onOpenChange={reset} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          <PlusIcon data-icon="inline-start" />
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
        <form
          className="flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (address) check.mutate(address);
          }}
        >
          <Input
            aria-label="Server address"
            autoComplete="url"
            autoFocus
            className="font-mono text-sm"
            onChange={(event) => {
              setDraft(event.target.value);
              check.reset();
            }}
            placeholder="http://my-server:8000/v1"
            value={draft}
          />
          <Button disabled={!address || check.isPending} type="submit" variant="outline">
            Check
          </Button>
        </form>
        <div className="min-h-5 text-sm" data-slot="add-server-result">
          {check.isPending ? (
            <p className="flex items-center gap-1.5 text-muted-foreground" role="status">
              <LoaderCircleIcon aria-hidden="true" className="size-4 animate-spin" />
              Checking…
            </p>
          ) : found ? (
            <p className={found.reachable ? 'text-foreground' : 'text-muted-foreground'} role="status">
              {found.sentence}
            </p>
          ) : check.error ? (
            <p className="text-destructive" role="alert">
              {check.error.message}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            disabled={!found?.reachable || !address || applying}
            onClick={() => {
              if (!address) return;
              onUse(address, found?.models[0]);
              reset(false);
            }}
            type="button"
          >
            Use this server
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
