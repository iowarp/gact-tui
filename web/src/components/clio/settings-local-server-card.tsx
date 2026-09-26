import type { LanguageModelPreset, ProviderCatalogEntry, SavedServer } from '@clio/core/v3';
import { LoaderCircleIcon, PencilIcon } from 'lucide-react';
import { useState } from 'react';
import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import { Badge } from '@/components/reui/badge';
import { IconTile } from '@/components/reui/icon-tile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSavedServers } from '@/hooks/use-saved-servers';
import { useServerCheck } from '@/hooks/use-server-check';
import { normalizeServerAddress, serverStatus } from '@/lib/local-servers';
import { providerLogoId } from '@/lib/provider-presentation';
import type { ProviderGroup } from './model-picker-model';
import { SettingsProviderDetailsSheet } from './settings-provider-details-sheet';

interface SettingsLocalServerCardProps {
  /** The preset the server is reached through (a catalog runtime, or `vllm` for a custom one). */
  preset: LanguageModelPreset;
  /** The saved entry: a runtime's changed address, or a custom server. */
  saved: SavedServer | undefined;
  group: ProviderGroup | undefined;
  catalogEntry: ProviderCatalogEntry | undefined;
  /** This server is the model new work starts with. */
  isDefault: boolean;
  applying: boolean;
  /** Make this server the default, with `model` when one was found. */
  onUse: (address: string, model: string | undefined) => void;
}

/**
 * One model server (LM Studio, Ollama, llama.cpp, vLLM, or one the person
 * added): its status in plain words -- a grey "Not running" is not an error
 * -- and its address, edited in place. Saving an address keeps it (the
 * service stores it and probes it from then on) and checks it at once;
 * making the server the default is a separate choice.
 */
export function SettingsLocalServerCard({
  preset,
  saved,
  group,
  catalogEntry,
  isDefault,
  applying,
  onUse,
}: SettingsLocalServerCardProps) {
  const custom = saved?.custom ?? false;
  const address = saved?.address || preset.api_base || '';
  const label = custom && saved ? saved.label : preset.label;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(address);
  const { save, check, remove } = useSavedServers();
  const localCheck = useServerCheck(preset.id);
  const typed = normalizeServerAddress(draft);
  const pending = save.isPending || check.isPending || localCheck.isPending || remove.isPending;
  const latest = localCheck.data ?? (saved?.check ? { reachable: saved.check.reachable, models: saved.check.models } : undefined);
  const status = serverStatus({ custom, group, latest });
  const error = save.error ?? check.error ?? localCheck.error ?? remove.error;

  async function saveAddress() {
    if (!typed) return;
    localCheck.reset();
    await save.mutateAsync({ address: typed, presetId: custom ? undefined : preset.id, serverId: saved?.id });
    setEditing(false);
  }

  return (
    <div className="flex items-start gap-3" data-provider-id={saved?.id ?? preset.id} data-slot="local-server-card">
      <IconTile aria-hidden="true" size="lg" variant="frame">
        <ModelSelectorLogo className="size-6" provider={providerLogoId(preset.id)} />
      </IconTile>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate font-medium">{label}</span>
          <StatusChip label={label} status={status} />
          {isDefault ? (
            <Badge radius="full" size="sm" variant="primary-light">
              Default
            </Badge>
          ) : null}
        </div>
        {editing ? (
          <form
            className="flex max-w-md items-center gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              void saveAddress();
            }}
          >
            <Input
              aria-label={`${label} address`}
              autoComplete="url"
              autoFocus
              className="h-7 font-mono text-xs"
              onChange={(event) => setDraft(event.target.value)}
              value={draft}
            />
            <Button disabled={!typed || pending} size="sm" type="submit">
              Save
            </Button>
            <Button onClick={() => setEditing(false)} size="sm" type="button" variant="ghost">
              Cancel
            </Button>
          </form>
        ) : (
          <button
            aria-label={`Change the ${label} address`}
            className="group flex w-fit max-w-full items-center gap-1.5 rounded-sm font-mono text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            onClick={() => {
              setDraft(address);
              setEditing(true);
            }}
            type="button"
          >
            <span className="truncate">{address}</span>
            <PencilIcon aria-hidden="true" className="size-3 opacity-60 group-hover:opacity-100" />
          </button>
        )}
        {pending ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
            <LoaderCircleIcon aria-hidden="true" className="size-3.5 animate-spin" />
            Checking…
          </p>
        ) : error ? (
          <p className="text-xs text-destructive" role="alert">
            {error.message}
          </p>
        ) : null}
        <SettingsProviderDetailsSheet catalogEntry={catalogEntry} group={group} preset={preset} />
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        <Button
          disabled={pending}
          onClick={() => (saved ? check.mutate(saved.id) : localCheck.mutate(address))}
          size="sm"
          type="button"
          variant="ghost"
        >
          Check
        </Button>
        {saved ? (
          <Button disabled={pending} onClick={() => remove.mutate(saved.id)} size="sm" type="button" variant="ghost">
            {custom ? 'Remove' : 'Reset address'}
          </Button>
        ) : null}
        {status.kind === 'running' && !isDefault ? (
          <Button
            disabled={applying || pending}
            onClick={() => onUse(address, latest?.models[0])}
            size="sm"
            type="button"
            variant="outline"
          >
            Make default
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function StatusChip({ label, status }: { label: string; status: ReturnType<typeof serverStatus> }) {
  if (status.kind === 'running') {
    return (
      <Badge data-slot="server-status" radius="full" size="sm" variant="success-light">
        {status.models ? `Running, ${status.models} ${status.models === 1 ? 'model' : 'models'}` : 'Running'}
      </Badge>
    );
  }
  if (status.kind === 'unknown') {
    return (
      <Badge data-slot="server-status" radius="full" size="sm" variant="secondary">
        Not checked yet
      </Badge>
    );
  }
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className="cursor-help" data-slot="server-status" radius="full" size="sm" variant="secondary">
            Not running
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          Start {label} and load a model, then check again.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
