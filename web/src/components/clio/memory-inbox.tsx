import type { MemoryProposal } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveIcon, CheckIcon, LayersIcon, type LucideIcon } from 'lucide-react';
import { AddIcon, CloseIcon, EditIcon, RefreshIcon } from '@/lib/icon-vocabulary';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useRepository } from '@/hooks/use-repository';
import { MemoryDiff } from './memory-document-dialog';
import { ReviewMarker } from './memory-source';
import { MemoryErrorLine } from './memory-error-line';
import { memoryErrorText } from './memory-document-helpers';
import { IconButton } from './primitives/icon-button';
import { ItemList, ItemRow } from './primitives/item-row';
import { StateView } from './primitives/state-view';
import { Tag, type TagTone } from './primitives/tag';

type SessionHref = (sessionId: string) => string | undefined;

const KINDS: Record<MemoryProposal['change'], { label: string; tone: TagTone; icon: LucideIcon }> =
  {
    add: { label: 'Add', tone: 'success', icon: AddIcon },
    supersede: { label: 'Replace', tone: 'warning', icon: RefreshIcon },
    merge: { label: 'Merge', tone: 'info', icon: LayersIcon },
    retire: { label: 'Retire', tone: 'danger', icon: ArchiveIcon },
  };

const SOURCE_WORDS: Record<string, string> = {
  user: 'your message',
  imported: 'imported notes',
  tool: 'a tool result',
  inferred: 'a conversation',
};

/** What the proposal would remember (or, for a retirement, what it removes). */
function proposalText(proposal: MemoryProposal) {
  return (
    proposal.facts.join(' ') ||
    (proposal.changes ?? [])
      .map((change) => change.before)
      .filter(Boolean)
      .join(' ') ||
    proposal.description ||
    proposal.rationale ||
    'Proposed change'
  );
}

function sourceLine(proposal: MemoryProposal) {
  const sources = [
    ...new Set(
      (proposal.sources.length
        ? proposal.sources
        : proposal.evidence.map((item) => item.source)
      ).map((source) => SOURCE_WORDS[source] ?? 'a conversation'),
    ),
  ];
  return sources.length ? `From ${sources.join(' and ')}` : 'From a conversation';
}

function Evidence({
  proposal,
  sessionHref,
}: {
  proposal: MemoryProposal;
  sessionHref: SessionHref;
}) {
  if (!proposal.evidence.length) return null;
  return (
    <details className="text-muted-foreground">
      <summary className="w-fit cursor-pointer">Source facts ({proposal.evidence.length})</summary>
      <ul aria-label="Evidence" className="mt-1.5 grid gap-1 leading-5">
        {proposal.evidence.map((item) => {
          const href = sessionHref(item.session);
          const label = item.fact || `${item.messages.length} message(s)`;
          return (
            <li key={item.id}>
              <span className="font-medium">
                {item.source === 'imported'
                  ? 'Imported notes'
                  : item.source === 'user'
                    ? 'User message'
                    : item.source === 'tool'
                      ? 'Tool result'
                      : item.source}
              </span>
              :{' '}
              {href ? (
                <a
                  className="text-foreground underline-offset-4 hover:underline"
                  href={item.messages[0] ? `${href}#message-${item.messages[0]}` : href}
                >
                  {label}
                </a>
              ) : (
                label
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function ProposalRow({
  proposal,
  expanded,
  focusFacts,
  onExpand,
  onCollapse,
  sessionHref,
  targetLabel,
}: {
  proposal: MemoryProposal;
  expanded: boolean;
  /** Opened with Edit: the facts field takes focus. */
  focusFacts: boolean;
  onExpand: (edit: boolean) => void;
  onCollapse: () => void;
  sessionHref: SessionHref;
  targetLabel: (proposal: MemoryProposal) => string;
}) {
  const repository = useRepository();
  const client = useQueryClient();
  const proposed = proposal.facts.join('\n');
  const [facts, setFacts] = useState(proposed);
  const refresh = () => void client.invalidateQueries({ queryKey: ['memory'] });
  const accept = useMutation({
    mutationFn: (edited?: string[]) => repository.acceptMemoryProposal(proposal.id, edited),
    onSuccess: () => {
      refresh();
      toast.success('Change applied');
    },
  });
  const reject = useMutation({
    mutationFn: () => repository.rejectMemoryProposal(proposal.id),
    onSuccess: () => {
      refresh();
      toast.success('Change rejected');
    },
  });
  const kind = KINDS[proposal.change];
  const Icon = kind.icon;
  const text = proposalText(proposal);
  const editable = proposal.change !== 'retire';
  const busy = accept.isPending || reject.isPending;
  const error = accept.error ?? reject.error;
  const apply = () => {
    if (!editable || facts.trim() === proposed.trim()) {
      accept.mutate(undefined);
      return;
    }
    accept.mutate(
      facts
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    );
  };
  const target = targetLabel(proposal);
  return (
    <div data-proposal={proposal.id}>
      <ItemRow
        actions={
          <>
            <IconButton
              className="relative z-10"
              disabled={busy}
              icon={<CheckIcon />}
              label="Accept"
              onClick={() => accept.mutate(undefined)}
            />
            <IconButton
              className="relative z-10"
              disabled={busy}
              icon={<EditIcon />}
              label="Edit"
              onClick={() => onExpand(true)}
            />
            <IconButton
              className="relative z-10"
              disabled={busy}
              icon={<CloseIcon />}
              label="Reject"
              onClick={() => reject.mutate()}
            />
          </>
        }
        actionsWidth={92}
        icon={<Icon />}
        meta={
          <span className="flex min-w-0 gap-3">
            <span className="shrink-0">{sourceLine(proposal)}</span>
            <span className="min-w-0 truncate" title={proposal.target}>
              {target}
            </span>
          </span>
        }
        selected={expanded}
        title={
          <span className="flex min-w-0 items-center gap-2">
            <Tag tone={kind.tone}>{kind.label}</Tag>
            <button
              aria-expanded={expanded}
              className="min-w-0 truncate text-left font-semibold outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-1 focus-visible:after:ring-ring focus-visible:after:ring-inset"
              onClick={() => (expanded ? onCollapse() : onExpand(false))}
              title={text}
              type="button"
            >
              {text}
            </button>
          </span>
        }
      />
      {expanded ? (
        <div className="grid min-w-0 gap-2 border-b border-border/70 py-3 pr-2 pl-10 text-ui">
          {proposal.rationale ? (
            <p className="text-muted-foreground">{proposal.rationale}</p>
          ) : null}
          <ReviewMarker sources={proposal.sources} />
          {editable ? (
            <div className="grid gap-1.5">
              <label className="text-menu" htmlFor={`facts-${proposal.id}`}>
                Facts to apply, one per line
              </label>
              <Textarea
                autoFocus={focusFacts}
                className="min-h-16 text-ui"
                disabled={busy}
                id={`facts-${proposal.id}`}
                onChange={(event) => setFacts(event.target.value)}
                rows={Math.max(2, proposal.facts.length + 1)}
                value={facts}
              />
            </div>
          ) : (
            <MemoryDiff after={proposal.proposed_text} before={proposal.base_text} />
          )}
          <Evidence proposal={proposal} sessionHref={sessionHref} />
          {error ? (
            <p className="text-destructive" role="alert">
              {memoryErrorText(error)}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button disabled={busy || (editable && !facts.trim())} onClick={apply} size="sm">
              {editable ? 'Apply' : 'Retire'}
            </Button>
            <Button onClick={onCollapse} size="sm" variant="ghost">
              Cancel
            </Button>
          </div>
        </div>
      ) : error ? (
        <p className="py-1 pl-10 text-menu text-destructive" role="alert">
          {memoryErrorText(error)}
        </p>
      ) : null}
    </div>
  );
}

/** Proposed changes waiting for a decision: accept, edit and apply, or reject. */
export function MemoryInbox({
  sessionHref,
  targetLabel,
  onSessionIds,
}: {
  sessionHref: SessionHref;
  /** Where the change lands, in words ("Account: Preferences"). */
  targetLabel: (proposal: MemoryProposal) => string;
  /** The sessions the shown proposals cite, so their links can be resolved. */
  onSessionIds?: (sessionIds: readonly string[]) => void;
}) {
  const repository = useRepository();
  const proposals = useQuery({
    queryKey: ['memory', 'proposals', 'pending'],
    queryFn: ({ signal }) => repository.memoryProposals('pending', signal),
  });
  const [open, setOpen] = useState<{ id: string; edit: boolean }>();
  useEffect(() => {
    if (proposals.data) {
      onSessionIds?.(
        proposals.data.flatMap((proposal) => proposal.evidence.map((item) => item.session)),
      );
    }
  }, [onSessionIds, proposals.data]);
  if (proposals.isPending) return <Skeleton className="h-24 w-full" />;
  if (proposals.error)
    return (
      <MemoryErrorLine
        error={proposals.error}
        onRetry={() => void proposals.refetch()}
        what="Proposed changes could not be loaded."
      />
    );
  if (!proposals.data.length)
    return <StateView kind="empty" size="row" title="Nothing to review" />;
  return (
    <ItemList label="Proposed changes">
      {proposals.data.map((proposal) => (
        <ProposalRow
          expanded={open?.id === proposal.id}
          focusFacts={open?.id === proposal.id && open.edit}
          key={proposal.id}
          onCollapse={() => setOpen(undefined)}
          onExpand={(edit) => setOpen({ id: proposal.id, edit })}
          proposal={proposal}
          sessionHref={sessionHref}
          targetLabel={targetLabel}
        />
      ))}
    </ItemList>
  );
}
