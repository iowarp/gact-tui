import type { McpServerDefinition, ToolCatalogItem } from '@clio/core/v3';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { vocab } from '@/lib/brand-vocabulary';
import { CatalogToolset } from './catalog-toolset';

/** Keep actual session availability distinct from browsing the agent catalog. */
export function InfrastructureTools({
  sessionId,
  sessionScoped,
  pending,
  tools,
  servers,
  onScope,
}: {
  sessionId?: string;
  sessionScoped: boolean;
  pending: boolean;
  tools: ToolCatalogItem[];
  servers: McpServerDefinition[];
  onScope: (scope: 'session' | 'agent') => void;
}) {
  return (
    <div className="mt-6">
      {sessionId ? (
        <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Tool scope">
          <span className="mr-1 text-xs text-muted-foreground">Show</span>
          <Button
            size="sm"
            variant={sessionScoped ? 'secondary' : 'ghost'}
            aria-pressed={sessionScoped}
            onClick={() => onScope('session')}
          >
            This session
          </Button>
          <Button
            size="sm"
            variant={!sessionScoped ? 'secondary' : 'ghost'}
            aria-pressed={!sessionScoped}
            onClick={() => onScope('agent')}
          >
            All agent tools
          </Button>
        </div>
      ) : null}
      {pending ? (
        <div aria-label="Loading tool catalog" className="grid gap-3" role="status">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-[32rem] w-full" />
        </div>
      ) : tools.length ? (
        <CatalogToolset servers={servers} tools={tools} />
      ) : (
        <div className="border-y py-6 text-sm text-muted-foreground">
          <p>
            {sessionScoped
              ? `This session has not recorded an effective ${vocab.agent} toolset yet.`
              : `${vocab.agent} has not reported any tools.`}
          </p>
          {sessionScoped ? (
            <Button className="mt-3" size="sm" variant="outline" onClick={() => onScope('agent')}>
              Browse all agent tools
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
