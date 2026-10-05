import type { AgentBlueprint } from '@clio/core/v3';
import { BoxesIcon } from 'lucide-react';
import { MarkdownText } from '@/components/ai-elements/markdown';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
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
  const services = Object.keys(recordValue(blueprint?.metadata.mcp_servers) ?? {});
  const requirements = Object.entries(recordValue(blueprint?.metadata.requires) ?? {}).filter(
    ([, value]) => typeof value === 'string',
  );

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
                {blueprint?.version ? `Version ${blueprint.version} · ` : ''}
                {blueprint?.scope === 'global' ? 'Shared blueprint' : 'Workspace blueprint'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <Tabs
          key={blueprint?.identity || blueprint?.id}
          defaultValue="overview"
          className="flex min-h-0 flex-col"
        >
          <TabsList className="shrink-0">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="instructions">Instructions</TabsTrigger>
            <TabsTrigger value="installation">Installation</TabsTrigger>
          </TabsList>
          <ScrollArea className="mt-4 min-h-0 pr-3">
            <TabsContent value="overview" className="mt-0 space-y-5">
              <p className="text-sm leading-6">
                {blueprint?.description || 'No description was provided.'}
              </p>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-3 text-sm">
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  {blueprint?.materialized === false ? (
                    'Available to install'
                  ) : (
                    <ClioStatus
                      value={
                        blueprint?.enabled && !blueprint.validation_errors.length
                          ? 'healthy'
                          : 'degraded'
                      }
                      label={
                        blueprint?.enabled && !blueprint.validation_errors.length
                          ? 'Installed'
                          : 'Needs attention'
                      }
                    />
                  )}
                </dd>
                <dt className="text-muted-foreground">Available to</dt>
                <dd>{blueprint?.scope === 'global' ? 'Every workspace' : 'This workspace'}</dd>
                <dt className="text-muted-foreground">Version</dt>
                <dd>{blueprint?.version || 'Unavailable'}</dd>
              </dl>
              <section className="space-y-2 border-t pt-4">
                <h3 className="text-sm font-medium">Connected services</h3>
                <p className="text-xs text-muted-foreground">
                  Services this blueprint declares for its tools.
                </p>
                <div className="flex flex-wrap gap-2">
                  {services.length ? (
                    services.map((name) => (
                      <Badge key={name} variant="outline">
                        {name}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No additional services declared.
                    </p>
                  )}
                </div>
              </section>
              {requirements.length > 0 && (
                <section className="space-y-2 border-t pt-4">
                  <h3 className="text-sm font-medium">Requirements</h3>
                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-2 text-sm">
                    {requirements.map(([name, value]) => (
                      <div key={name} className="contents">
                        <dt>{name.replaceAll('_', ' ')}</dt>
                        <dd className="text-muted-foreground">{String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}
              {blueprint?.validation_errors.length ? (
                <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                  <h3 className="font-medium text-destructive">Needs attention</h3>
                  <ul className="mt-2 space-y-1 text-destructive">
                    {blueprint.validation_errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </TabsContent>
            <TabsContent value="instructions" className="mt-0">
              {instructions ? (
                <MarkdownText className="text-sm leading-6">{instructions}</MarkdownText>
              ) : (
                <p className="text-sm text-muted-foreground">No instructions were provided.</p>
              )}
            </TabsContent>
            <TabsContent value="installation" className="mt-0">
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-3 text-sm">
                <dt className="text-muted-foreground">Source</dt>
                <dd className="break-all">{source || 'Not recorded'}</dd>
                {installedAt && (
                  <>
                    <dt className="text-muted-foreground">Installed</dt>
                    <dd>
                      <ClioRelativeTime label="Installed" timestamp={installedAt} />
                    </dd>
                  </>
                )}
                {(['ref', 'commit', 'pinned_commit'] as const).map((key) =>
                  stringValue(installation?.[key]) ? (
                    <div key={key} className="contents">
                      <dt className="text-muted-foreground">
                        {key === 'ref'
                          ? 'Branch or tag'
                          : key === 'commit'
                            ? 'Revision'
                            : 'Pinned revision'}
                      </dt>
                      <dd className="break-all font-mono text-xs">{String(installation?.[key])}</dd>
                    </div>
                  ) : null,
                )}
                <dt className="text-muted-foreground">Blueprint ID</dt>
                <dd className="break-all">{blueprint?.blueprint_id || blueprint?.id}</dd>
              </dl>
            </TabsContent>
          </ScrollArea>
        </Tabs>
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
