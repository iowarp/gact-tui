import type { MemoryProposal } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { InboxIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useRepository } from '@/hooks/use-repository';
import { MemoryDiff } from './memory-document-dialog';
import { ReviewMarker } from './memory-source';

type SessionHref = (sessionId: string) => string | undefined;

const CHANGE_LABELS: Record<MemoryProposal['change'], string> = {
  add: 'Add',
  supersede: 'Replace',
  merge: 'Merge',
  retire: 'Retire',
};

function Evidence({
  proposal,
  sessionHref,
}: {
  proposal: MemoryProposal;
  sessionHref: SessionHref;
}) {
  if (!proposal.evidence.length) return null;
  return (
    <ul aria-label="Evidence" className="grid gap-1 text-xs text-muted-foreground">
      {proposal.evidence.map((item) => {
        const href = sessionHref(item.session);
        const label = item.fact || `${item.messages.length} message(s)`;
        return (
          <li key={item.id}>
            <span className="font-medium">{item.source}</span>:{' '}
            {href ? (
              <a
                className="underline"
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
  );
}

function ProposalCard({
  proposal,
  sessionHref,
}: {
  proposal: MemoryProposal;
  sessionHref: SessionHref;
}) {
  const repository = useRepository();
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [facts, setFacts] = useState(proposal.facts.join('\n'));
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
  const editable = proposal.change !== 'retire';
  const busy = accept.isPending || reject.isPending;
  return (
    <li className="grid gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{CHANGE_LABELS[proposal.change]}</Badge>
        <span className="min-w-0 truncate text-sm font-medium">{proposal.target}</span>
        <ReviewMarker sources={proposal.sources} />
      </div>
      {proposal.rationale ? <p className="text-sm">{proposal.rationale}</p> : null}
      {editing ? (
        <Textarea
          aria-label="Facts to apply, one per line"
          onChange={(event) => setFacts(event.target.value)}
          rows={Math.max(3, proposal.facts.length + 1)}
          value={facts}
        />
      ) : (
        <MemoryDiff after={proposal.proposed_text} before={proposal.base_text} />
      )}
      <Evidence proposal={proposal} sessionHref={sessionHref} />
      <div className="flex flex-wrap gap-2">
        {editing ? (
          <>
            <Button
              disabled={busy}
              onClick={() =>
                accept.mutate(
                  facts
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean),
                )
              }
              size="sm"
            >
              Apply edited
            </Button>
            <Button onClick={() => setEditing(false)} size="sm" variant="ghost">
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button disabled={busy} onClick={() => accept.mutate(undefined)} size="sm">
              Accept
            </Button>
            {editable ? (
              <Button disabled={busy} onClick={() => setEditing(true)} size="sm" variant="outline">
                Edit and accept
              </Button>
            ) : null}
          </>
        )}
        <Button disabled={busy} onClick={() => reject.mutate()} size="sm" variant="ghost">
          Reject
        </Button>
      </div>
      {accept.error || reject.error ? (
        <p className="text-sm text-destructive" role="alert">
          {(accept.error ?? reject.error)?.message}
        </p>
      ) : null}
    </li>
  );
}

/** Proposed changes waiting for a decision: accept, edit and accept, or reject. */
export function MemoryInbox({ sessionHref }: { sessionHref: SessionHref }) {
  const repository = useRepository();
  const proposals = useQuery({
    queryKey: ['memory', 'proposals', 'pending'],
    queryFn: ({ signal }) => repository.memoryProposals('pending', signal),
  });
  if (proposals.isPending) return <Skeleton className="h-20 w-full" />;
  if (proposals.error)
    return (
      <Alert variant="destructive">
        <AlertTitle>Proposals unavailable</AlertTitle>
        <AlertDescription>{proposals.error.message}</AlertDescription>
      </Alert>
    );
  if (!proposals.data.length)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <InboxIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Nothing to review</EmptyTitle>
          <EmptyDescription>
            Changes learned from conversations or imports appear here when they need your decision.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <ul aria-label="Proposed changes" className="grid gap-3">
      {proposals.data.map((proposal) => (
        <ProposalCard key={proposal.id} proposal={proposal} sessionHref={sessionHref} />
      ))}
    </ul>
  );
}
