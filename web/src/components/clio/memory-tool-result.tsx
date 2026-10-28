import {
  memoryFactChangeSchema,
  type MemoryFactChange,
  type MemoryProposal,
  type ToolInvocation,
} from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { connectionScope } from '@/lib/connection-scope';
import { memoryChanges } from '@/lib/memory-changes';
import { useConnectionSettings } from '@/providers/connection-provider';
import { BoundedResult } from './bounded-result';
import { MemoryFactChanges } from './memory-fact-changes';
import { asRecord, toolResultRecord } from './tool-result-shared';

/** Recorded facts and corrections are visible without opening a disclosure or Settings. */
export function MemoryToolResult({ tool }: { tool: ToolInvocation }) {
  const row = toolResultRecord(tool.output);
  if (!row || row.truncated) return <Unavailable />;
  if (tool.name === 'propose_memory_change') {
    const parsed = memoryFactChangeSchema.array().safeParse(row.changes);
    if (parsed.success) return <Facts changes={parsed.data} />;
    return typeof row.proposal === 'string' ? (
      <RetainedProposal id={row.proposal} />
    ) : (
      <Unavailable />
    );
  }
  if (tool.name === 'memory_read') {
    if (!Array.isArray(row.facts)) return <Unavailable />;
    const current = row.facts
      .map(asRecord)
      .filter((f) => f && f.live !== false && typeof f.text === 'string');
    return (
      <Facts
        changes={current.map((f, index) => ({
          id: String(f!.id || index),
          kind: 'read',
          before: '',
          after: String(f!.text),
        }))}
      />
    );
  }
  const notice = asRecord(row.memory),
    fact = asRecord(row.fact),
    previous = asRecord(row.previous_fact);
  if (notice?.action === 'already_remembered' && typeof fact?.text === 'string')
    return (
      <Facts
        changes={[{ id: String(fact.id || ''), kind: 'read', before: '', after: fact.text }]}
      />
    );
  if (typeof fact?.text === 'string') {
    const removed = tool.name === 'forget_memory';
    const changes: MemoryFactChange[] = [
      {
        id: String(fact.id || ''),
        kind: removed
          ? 'removed'
          : tool.name === 'update_memory'
            ? typeof previous?.text === 'string'
              ? 'updated'
              : 'read'
            : 'added',
        before: removed ? fact.text : typeof previous?.text === 'string' ? previous.text : '',
        after: removed ? '' : fact.text,
      },
    ];
    return (
      <>
        {tool.name === 'update_memory' && typeof previous?.text !== 'string' ? (
          <p className="ml-7 text-sm text-muted-foreground">The earlier value was not retained.</p>
        ) : null}
        <Facts changes={changes} />
      </>
    );
  }
  if (Array.isArray(row.forgotten_facts))
    return (
      <Facts
        changes={row.forgotten_facts
          .map(asRecord)
          .filter((f) => typeof f?.text === 'string')
          .map((f, index) => ({
            id: String(f!.id || index),
            kind: 'removed',
            before: String(f!.text),
            after: '',
          }))}
      />
    );
  return <Unavailable />;
}

function Facts({ changes }: { changes: MemoryFactChange[] }) {
  return (
    <div className="ml-7 min-w-0 py-1" data-slot="memory-tool-facts">
      <BoundedResult lines={3} unit="items" title="Memory facts">
        <MemoryFactChanges changes={changes} />
      </BoundedResult>
    </div>
  );
}

function Unavailable() {
  return (
    <p className="ml-7 text-sm text-muted-foreground">
      The facts were not retained with this result.
    </p>
  );
}

function RetainedProposal({ id }: { id: string }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const proposals = useQuery({
    queryKey: ['memory', 'proposals', 'all', connectionScope(settings)],
    queryFn: ({ signal }) => repository.memoryProposals('all', signal),
    staleTime: 30_000,
  });
  if (proposals.isPending)
    return (
      <p role="status" className="ml-7 text-sm text-muted-foreground">
        Loading recorded changes…
      </p>
    );
  const proposal = proposals.data?.find((p: MemoryProposal) => p.id === id);
  if (!proposal) return <Unavailable />;
  // This is the proposal made at this tool call, even if someone accepted it later.
  return (
    <Facts
      changes={proposal.changes ?? memoryChanges(proposal.base_text, proposal.proposed_text)}
    />
  );
}
