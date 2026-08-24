import type { AgentBlueprint } from '@clio/core/v3';
import { BookOpenTextIcon, BoxesIcon } from 'lucide-react';
import { MessageResponse } from '@/components/ai-elements/message';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ClioRelativeTime } from './relative-time';
import { ClioStatus } from './status';

interface BlueprintDetailsDialogProps {
  blueprint?: AgentBlueprint;
  onOpenChange: (open: boolean) => void;
}

/** Product-facing blueprint viewer with full instructions available on demand. */
export function BlueprintDetailsDialog({ blueprint, onOpenChange }: BlueprintDetailsDialogProps) {
  const installation = recordValue(blueprint?.metadata.install);
  const instructions = stringValue(blueprint?.metadata.body);
  const installedAt = stringValue(installation?.installed_at);
  const source = stringValue(installation?.source);
  const serviceCount = Object.keys(recordValue(blueprint?.metadata.mcp_servers) ?? {}).length;

  return (
    <Dialog onOpenChange={onOpenChange} open={Boolean(blueprint)}>
      <DialogContent className="grid max-h-[min(760px,calc(100dvh-2rem))] grid-rows-[auto_minmax(0,1fr)] sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start gap-3 pr-8">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <BoxesIcon aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <DialogTitle>{blueprint?.display_name}</DialogTitle>
              <DialogDescription className="mt-1">
                {blueprint?.description || 'No description was provided.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <ScrollArea className="min-h-0 pr-3">
          <div className="grid gap-5">
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-2 rounded-xl border p-4 text-sm">
              <span className="text-muted-foreground">Status</span>
              <ClioStatus value={blueprint?.enabled ? 'healthy' : 'degraded'} />
              <span className="text-muted-foreground">Available to</span>
              <span>{blueprint?.scope === 'global' ? 'Every workspace' : 'This workspace'}</span>
              <span className="text-muted-foreground">Version</span>
              <span>{blueprint?.version || 'Unavailable'}</span>
              <span className="text-muted-foreground">Connected services</span>
              <span>{serviceCount || 'None declared'}</span>
              {source ? (
                <>
                  <span className="text-muted-foreground">Installed from</span>
                  <span className="truncate" title={source}>
                    {pathName(source)}
                  </span>
                </>
              ) : null}
              {installedAt ? (
                <>
                  <span className="text-muted-foreground">Installed</span>
                  <ClioRelativeTime label="Installed" timestamp={installedAt} />
                </>
              ) : null}
            </div>
            {blueprint?.validation_errors.length ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <p className="font-medium text-destructive">Needs attention</p>
                <ul className="mt-2 grid gap-1 text-sm text-destructive">
                  {blueprint.validation_errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {instructions ? (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button className="w-full justify-start" variant="outline">
                    <BookOpenTextIcon aria-hidden="true" /> View blueprint instructions
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 rounded-xl border p-4">
                  <MessageResponse className="text-sm leading-6">{instructions}</MessageResponse>
                </CollapsibleContent>
              </Collapsible>
            ) : null}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function pathName(value: string): string {
  return value.split(/[\\/]/u).filter(Boolean).at(-1) ?? value;
}
