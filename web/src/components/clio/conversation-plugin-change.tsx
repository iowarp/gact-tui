import type { MessageBlock } from '@clio/core/v3';
import { SyringeIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { useConnectors } from '@/hooks/use-connectors';
import { usePluginCatalog } from '@/hooks/use-session-agent';
import {
  humanizePluginId,
  pluginChangeLabel,
  pluginChangeTools,
  pluginNameResolver,
} from '@/lib/plugin-presentation';
import { useHasConnection } from '@/providers/connection-provider';
import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

type InjectionBlock = Extract<MessageBlock, { type: 'injection' }>;

/**
 * A plugin change the agent was told about as an instruction, because its
 * system prompt keeps the plugins it had until the next compaction. A compact
 * chip; hover, focus or a press shows exactly what the agent got.
 */
export function PluginChangeInjection({ block }: { block: InjectionBlock }) {
  // A bare chip (no connection, as in a test) reads ids as words; in the app the
  // connectors and installed plugins name them.
  return useHasConnection() ? (
    <NamedPluginChange block={block} />
  ) : (
    <PluginChangeChip block={block} nameOf={humanizePluginId} />
  );
}

function NamedPluginChange({ block }: { block: InjectionBlock }) {
  const connectors = useConnectors();
  const plugins = usePluginCatalog();
  const nameOf = pluginNameResolver(plugins.data?.plugins, connectors.data);
  return <PluginChangeChip block={block} nameOf={nameOf} />;
}

function PluginChangeChip({
  block,
  nameOf,
}: {
  block: InjectionBlock;
  nameOf: (id: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const label = pluginChangeLabel(block.text, nameOf);
  const tools = pluginChangeTools(block.text);
  const toolList = tools.join(', ');
  return (
    <section
      className="min-w-0 max-w-full py-0.5"
      data-slot="harness-injection"
      data-source={block.source}
    >
      <HoverCard closeDelay={100} onOpenChange={setOpen} open={open} openDelay={150}>
        <HoverCardTrigger asChild>
          <button
            aria-describedby={open ? detailsId : undefined}
            aria-expanded={open}
            className="inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 rounded-full border bg-muted/50 px-2 text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
            onClick={() => setOpen(true)}
            type="button"
          >
            <SyringeIcon aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="min-w-0 truncate">{label}</span>
          </button>
        </HoverCardTrigger>
        <HoverCardContent
          align="start"
          className="grid max-h-[min(24rem,60dvh)] w-[min(32rem,calc(100vw-2rem))] gap-2 overflow-y-auto"
          data-slot="plugin-change-details"
          id={detailsId}
        >
          <p className="font-medium">
            {t`Sent to the agent as an instruction. Its system prompt updates at the next compaction.`}
          </p>
          {tools.length ? (
            <p className="text-xs">
              <Trans>
                The agent can call these tools now: <span className="font-mono">{toolList}</span>
              </Trans>
            </p>
          ) : null}
          <pre className="min-w-0 rounded-md bg-muted p-2 font-mono text-xs leading-5 whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">
            {block.text}
          </pre>
        </HoverCardContent>
      </HoverCard>
    </section>
  );
}
