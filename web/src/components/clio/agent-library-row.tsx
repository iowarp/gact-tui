import type { AgentEntry } from '@clio/core/v3';
import { BotIcon, CopyIcon, EyeIcon, FileIcon } from 'lucide-react';
import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { DraftAgent } from '@/hooks/use-draft-agent-change';
import { copyText } from '@/lib/clipboard';
import { agentSearchTarget } from '@/lib/global-search-commands';
import { DeleteIcon, MoreIcon } from '@/lib/icon-vocabulary';
import { agentDisplayName } from '@/lib/plugin-presentation';
import { DraftAgentCompositionView } from './agent-composition-view';
import { DetailPane } from './primitives/detail-pane';
import { IconButton } from './primitives/icon-button';
import { ItemRow } from './primitives/item-row';
import { MenuRow } from './primitives/menu-row';
import { RowConfirm } from './primitives/row-confirm';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * The muted line under an agent's name. Your agents say what they start from
 * and what they add or remove; installed agents show their description.
 */
function agentMeta(agent: AgentEntry, agents: readonly AgentEntry[]): string[] {
  const count = plural(agent.plugins.length, 'plugin');
  if (agent.kind !== 'user') return agent.description ? [agent.description] : [count];
  const parent = agent.extends ? agentDisplayName(agent.extends, agents) : '';
  const add = agent.delta?.add ?? [];
  const remove = agent.delta?.remove ?? [];
  const basis = parent
    ? `Based on ${parent}${add.length ? ` and ${add.join(', ')}` : ''}${
        remove.length ? `, without ${remove.join(', ')}` : ''
      }`
    : agent.description || 'Yours';
  return [basis, count];
}

function MetaParts({ parts }: { parts: readonly string[] }) {
  // The basis truncates first so the plugin count stays readable on narrow lists.
  return (
    <span className="flex min-w-0 gap-3" title={parts.join(', ')}>
      {parts.map((part, index) => (
        <span className={index ? 'shrink-0' : 'min-w-0 truncate'} key={part}>
          {part}
        </span>
      ))}
    </span>
  );
}

/**
 * One agent as an item row: bot glyph, name, what it is based on, hover
 * actions (explore, delete for yours, more) and an optional right slot (the
 * Default tag). Enter or a click on the row explores it.
 */
export function AgentRow({
  agent,
  agents,
  onPreview,
  onDelete,
  onViewSource,
  metadata,
  selected = false,
  slot,
}: {
  agent: AgentEntry;
  agents: readonly AgentEntry[];
  onPreview: () => void;
  /** Deletes once the row's inline confirm says so; a promise keeps the confirm waiting. */
  onDelete?: () => unknown;
  onViewSource?: () => void;
  metadata?: ReactNode;
  selected?: boolean;
  /** Right column (the Default tag). Pass `null` to keep the column empty but aligned. */
  slot?: ReactNode;
}) {
  const name = agent.name || agent.id;
  // Delete asks on the row (spec: an inline confirm, focus stays put).
  const [asking, setAsking] = useState(false);
  const confirming = asking && Boolean(onDelete);
  const open = (event: MouseEvent<HTMLDivElement>) => {
    // Buttons and menu items (portaled, but still bubbling through React) do their own thing.
    if ((event.target as Element).closest('button, a, [role="menuitem"], [role="menu"]')) return;
    if (confirming) return;
    onPreview();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || confirming) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      onPreview();
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && onDelete) {
      event.preventDefault();
      setAsking(true);
    }
  };
  return (
    <ItemRow
      aria-current={selected || undefined}
      className="cursor-default target:bg-primary/10"
      confirm={
        confirming && onDelete ? (
          <RowConfirm
            action="Delete"
            busyAction="Deleting…"
            onConfirm={onDelete}
            onKeep={() => setAsking(false)}
            question="Delete this agent?"
          />
        ) : undefined
      }
      data-agent-ref={agent.ref}
      icon={<BotIcon />}
      id={agentSearchTarget(agent.ref)}
      meta={metadata ?? <MetaParts parts={agentMeta(agent, agents)} />}
      onClick={open}
      onKeyDown={onKeyDown}
      selected={selected}
      slot={slot}
      tabIndex={0}
      title={<span title={name}>{name}</span>}
      actions={
        <>
          <IconButton
            aria-pressed={selected}
            icon={<EyeIcon />}
            label={`Explore ${name}`}
            onClick={onPreview}
          />
          {onDelete ? (
            <IconButton
              icon={<DeleteIcon />}
              label={`Delete ${name}`}
              onClick={() => setAsking(true)}
            />
          ) : null}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <IconButton icon={<MoreIcon />} label={`More actions for ${name}`} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              {onViewSource ? (
                <DropdownMenuItem onSelect={onViewSource}>
                  <MenuRow icon={<FileIcon />} label="View saved file" />
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                onSelect={() =>
                  void copyText(agent.ref).then(
                    () => toast.success('Reference copied', { description: agent.ref }),
                    (error: unknown) =>
                      toast.error('Could not copy the reference', {
                        description: error instanceof Error ? error.message : agent.ref,
                      }),
                  )
                }
              >
                <MenuRow icon={<CopyIcon />} label="Copy reference" description={agent.ref} />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    />
  );
}

function useAgentDraft(agent: AgentEntry) {
  return useState<DraftAgent>({ ref: agent.ref, delta: { add: [], remove: [] } });
}

/** An agent's resolved plugins, prompt and provenance, beside the list (detail pane). */
export function AgentPreviewPane({ agent, onClose }: { agent: AgentEntry; onClose: () => void }) {
  const [draft, setDraft] = useAgentDraft(agent);
  return (
    <DetailPane icon={<BotIcon />} onClose={onClose} title={agent.name || agent.id}>
      <DraftAgentCompositionView draft={draft} embedded library onChange={setDraft} />
    </DetailPane>
  );
}

/**
 * The same exploration as a dialog, for hosts without room for a detail pane
 * beside their list (the private local library).
 */
export function AgentPreviewDialog({ agent, onClose }: { agent: AgentEntry; onClose: () => void }) {
  const [draft, setDraft] = useAgentDraft(agent);
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
