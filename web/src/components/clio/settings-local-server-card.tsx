import type { LanguageModelPreset, ProviderCatalogEntry } from '@clio/core/v3';
import { LoaderCircleIcon, PencilIcon } from 'lucide-react';
import { useState } from 'react';
import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import { Badge } from '@/components/reui/badge';
import { IconTile } from '@/components/reui/icon-tile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useServerCheck } from '@/hooks/use-server-check';
import { normalizeServerAddress } from '@/lib/local-servers';
import { providerLogoId } from '@/lib/provider-presentation';
import { providerUsableModelCount, type ProviderGroup } from './model-picker-model';
import { SettingsProviderDetailsSheet } from './settings-provider-details-sheet';

interface SettingsLocalServerCardProps {
  preset: LanguageModelPreset;
  group: ProviderGroup | undefined;
  catalogEntry: ProviderCatalogEntry | undefined;
  /** The address new work uses when this server is the default, else the service's own. */
  address: string;
  /** This server is the model new work starts with. */
  isDefault: boolean;
  applying: boolean;
  /** Make this server, at `address`, the default -- with `model` when one was found. */
  onUse: (address: string, model: string | undefined) => void;
}

/**
 * One server on this computer (LM Studio, Ollama, llama.cpp, vLLM): its
 * status in plain words -- grey "Not running" is not an error -- and its
 * address, edited in place and checked live ("Running, with 3 models").
 * A checked address is kept by making the server the default.
 */
export function SettingsLocalServerCard({
  preset,
  group,
  catalogEntry,
  address,
  isDefault,
  applying,
  onUse,
}: SettingsLocalServerCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(address);
  const check = useServerCheck(preset.id);
  const running = group?.health === 'healthy' || group?.health === 'checking';
  const count = group ? providerUsableModelCount(group) : 0;
  const checked = check.data;
  const typed = normalizeServerAddress(draft);
  const changed = Boolean(typed) && typed !== address;
  const canUse = Boolean(checked?.reachable) && (changed || !isDefault);

  return (
    <div className="flex items-start gap-3" data-provider-id={preset.id} data-slot="local-server-card">
      <IconTile aria-hidden="true" size="lg" variant="frame">
        <ModelSelectorLogo className="size-6" provider={providerLogoId(preset.id)} />
      </IconTile>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate font-medium">{preset.label}</span>
          {running ? (
            <Badge radius="full" size="sm" variant="success-light">
              {count ? `Running, ${count} ${count === 1 ? 'model' : 'models'}` : 'Running'}
            </Badge>
          ) : (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className="cursor-help" radius="full" size="sm" variant="secondary">
                    Not running
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Start {preset.label} on this computer and load a model, then check again.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
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
              if (typed) check.mutate(typed);
            }}
          >
            <Input
              aria-label={`${preset.label} address`}
              autoComplete="url"
              autoFocus
              className="h-7 font-mono text-xs"
              onChange={(event) => {
                setDraft(event.target.value);
                check.reset();
              }}
              value={draft}
            />
            <Button disabled={!typed || check.isPending} size="sm" type="submit" variant="outline">
              Check
            </Button>
          </form>
        ) : (
          <button
            aria-label={`Change the ${preset.label} address`}
            className="group flex w-fit max-w-full items-center gap-1.5 rounded-sm font-mono text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            onClick={() => setEditing(true)}
            type="button"
          >
            <span className="truncate">{address}</span>
            <PencilIcon aria-hidden="true" className="size-3 opacity-60 group-hover:opacity-100" />
          </button>
        )}
        {check.isPending ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
            <LoaderCircleIcon aria-hidden="true" className="size-3.5 animate-spin" />
            Checking…
          </p>
        ) : checked ? (
          <p className="text-xs text-muted-foreground" data-slot="server-check-result" role="status">
            {checked.sentence}
          </p>
        ) : check.error ? (
          <p className="text-xs text-destructive" role="alert">
            {check.error.message}
          </p>
        ) : null}
        <SettingsProviderDetailsSheet catalogEntry={catalogEntry} group={group} preset={preset} />
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {!editing ? (
          <Button
            disabled={check.isPending}
            onClick={() => check.mutate(address)}
            size="sm"
            type="button"
            variant="ghost"
          >
            Check
          </Button>
        ) : null}
        {canUse ? (
          <Button
            disabled={applying}
            onClick={() => onUse(typed ?? address, checked?.models[0])}
            size="sm"
            type="button"
          >
            {isDefault ? 'Save address' : 'Use this server'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
