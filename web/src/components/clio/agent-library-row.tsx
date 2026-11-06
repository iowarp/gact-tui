import type { AgentEntry } from '@clio/core/v3';
import { BotIcon, UserRoundIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { DraftAgent } from '@/hooks/use-draft-agent-change';
import { agentSearchTarget } from '@/lib/global-search-commands';
import { DeleteIcon } from '@/lib/icon-vocabulary';
import { agentDisplayName } from '@/lib/plugin-presentation';
import { DraftAgentCompositionView } from './agent-composition-view';
import { CatalogItem } from './catalog-item';

/** One agent identity; its description and inheritance stay available on expansion. */
export function AgentRow({
  agent,
  agents,
  onPreview,
  onDelete,
  onViewSource,
  metadata,
}: {
  agent: AgentEntry;
  agents: readonly AgentEntry[];
  onPreview: () => void;
  onDelete?: () => void;
  onViewSource?: () => void;
  metadata?: ReactNode;
}) {
  const Icon = agent.kind === 'user' ? UserRoundIcon : BotIcon;
  return (
    <li
      id={agentSearchTarget(agent.ref)}
      tabIndex={-1}
      className="min-w-0 rounded-md target:bg-primary/10"
    >
      <CatalogItem
        label={agent.name || agent.id}
        icon={<Icon />}
        metadata={
          metadata ?? (
            <span className="truncate">
              {agent.kind === 'user'
                ? 'Yours'
                : `${agent.plugins.length} ${agent.plugins.length === 1 ? 'plugin' : 'plugins'}`}
            </span>
          )
        }
        actions={
          onDelete ? (
            <Button
              aria-label={`Delete ${agent.name || agent.ref}`}
              onClick={onDelete}
              size="icon-sm"
              variant="ghost"
            >
              <DeleteIcon aria-hidden="true" />
            </Button>
          ) : undefined
        }
      >
        <p className="font-mono text-xs text-muted-foreground">
          {agent.ref}
          {agent.version ? ` (${agent.version})` : ''}
        </p>
        {agent.description ? <p className="text-muted-foreground">{agent.description}</p> : null}
        {agent.kind === 'user' && agent.extends ? (
          <p className="text-xs text-muted-foreground">
            Starts from {agentDisplayName(agent.extends, agents)}
            {agent.delta?.add.length ? `; adds ${agent.delta.add.join(', ')}` : ''}
            {agent.delta?.remove.length ? `; removes ${agent.delta.remove.join(', ')}` : ''}
          </p>
        ) : null}
        {agent.flow && agent.flow.id !== 'react' ? (
          <p className="text-xs">Flow: {agent.flow.id}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="justify-self-start"
            size="xs"
            variant="outline"
            aria-label={`Explore ${agent.name || agent.id}`}
            onClick={onPreview}
          >
            Explore agent
          </Button>
          {onViewSource ? (
            <Button size="xs" variant="ghost" onClick={onViewSource}>
              View saved file
            </Button>
          ) : null}
        </div>
      </CatalogItem>
    </li>
  );
}

export function AgentPreviewDialog({ agent, onClose }: { agent: AgentEntry; onClose: () => void }) {
  const [draft, setDraft] = useState<DraftAgent>({
    ref: agent.ref,
    delta: { add: [], remove: [] },
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex h-[min(48rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogTitle className="sr-only">{agent.name || agent.ref}</DialogTitle>
        <DialogDescription className="sr-only">
          Explore this agent and save a local variation.
        </DialogDescription>
        <DraftAgentCompositionView draft={draft} onChange={setDraft} library />
      </DialogContent>
    </Dialog>
  );
}
