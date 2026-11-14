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
import { handleRowMenuKey, ROW_MENU_OPEN_VISIBLE } from '@/lib/settings-row-keys';
import { cn } from '@/lib/utils';
import { DraftAgentCompositionView } from './agent-composition-view';
import { DetailPane } from './primitives/detail-pane';
import { IconButton } from './primitives/icon-button';
import { ItemRow } from './primitives/item-row';
import { MenuRow } from './primitives/menu-row';
import { RowConfirm } from './primitives/row-confirm';
import { plural, t } from '@lingui/core/macro';

/**
 * The muted line under an agent's name. Your agents say what they start from
 * and what they add or remove; installed agents show their description.
 */
function agentMeta(agent: AgentEntry, agents: readonly AgentEntry[]): string[] {
  const count = plural(agent.plugins.length, { one: '# package', other: '# packages' });
  if (agent.kind !== 'user') return agent.description ? [agent.description] : [count];
  const parent = agent.extends ? agentDisplayName(agent.extends, agents) : '';
  const add = agent.delta?.add ?? [];
  const remove = agent.delta?.remove ?? [];
  const added = add.join(', ');
  const removed = remove.join(', ');
  const basis = !parent
    ? agent.description || t`Yours`
    : add.length && remove.length
      ? t`Based on ${parent} and ${added}, without ${removed}`
      : add.length
        ? t`Based on ${parent} and ${added}`
        : remove.length
          ? t`Based on ${parent}, without ${removed}`
          : t`Based on ${parent}`;
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
    if (handleRowMenuKey(event)) return;
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
      className={cn('cursor-default target:bg-primary/10', ROW_MENU_OPEN_VISIBLE)}
      confirm={
        confirming && onDelete ? (
          <RowConfirm
            action="Delete"
            busyAction="Deleting…"
            onConfirm={onDelete}
            onKeep={() => setAsking(false)}
            question={`Delete ${name}?`}
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
      // Explore, Delete and More float over the row's end, so descriptions get the width.
      floatActions
      tabIndex={0}
      title={<span title={name}>{name}</span>}
      wrapTitle
      actions={
        <>
          <IconButton
            aria-pressed={selected}
            icon={<EyeIcon />}
            label={t`Explore ${name}`}
            onClick={onPreview}
          />
          {onDelete ? (
            <IconButton
              icon={<DeleteIcon />}
              label={t`Delete ${name}`}
              onClick={() => setAsking(true)}
            />
          ) : null}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <IconButton icon={<MoreIcon />} label={t`More actions for ${name}`} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              {onViewSource ? (
                <DropdownMenuItem onSelect={onViewSource}>
                  <MenuRow icon={<FileIcon />} label={t`View saved file`} />
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                onSelect={() =>
                  void copyText(agent.ref).then(
                    () => toast.success(t`Reference copied`, { description: agent.ref }),
                    (error: unknown) =>
                      toast.error(t`Could not copy the reference`, {
                        description: error instanceof Error ? error.message : agent.ref,
                      }),
                  )
                }
              >
                <MenuRow icon={<CopyIcon />} label={t`Copy reference`} description={agent.ref} />
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
export function AgentPreviewPane({
  agent,
  naming = false,
  onClose,
}: {
  agent: AgentEntry;
  /** Opened by New agent: the save dialog starts open to name the variation. */
  naming?: boolean;
  onClose: () => void;
}) {
  const [draft, setDraft] = useAgentDraft(agent);
  return (
    <DetailPane icon={<BotIcon />} onClose={onClose} title={agent.name || agent.id}>
      <DraftAgentCompositionView
        draft={draft}
        embedded
        library
        naming={naming}
        onChange={setDraft}
      />
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
          {t`Explore this agent and save a local variation.`}
        </DialogDescription>
        <DraftAgentCompositionView draft={draft} onChange={setDraft} library />
      </DialogContent>
    </Dialog>
  );
}
