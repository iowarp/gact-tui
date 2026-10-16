import type { ClioObservabilityDockProps } from './observability-dock-shell';
import { useState } from 'react';
import { ArrowLeftRightIcon, GitForkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConversationRelationships } from './conversation-relationships';
import { ClioProcessLanes } from './observability-processes';
import { ConversationGantt } from './conversation-gantt';
import { conversationFamily } from './conversation-relationships-model';
import { useConversationWorkState } from './use-conversation-work-state';
import { TaskPageContinuation } from './async-task-list';

/** Swap ancestry and execution in the existing Observability work surface. */
export function ObservabilityWork(
  props: Pick<
    ClioObservabilityDockProps,
    | 'sessionId'
    | 'familyProvenance'
    | 'familyProvenancePending'
    | 'sessions'
    | 'artifacts'
    | 'onOpenArtifact'
    | 'executionProvenance'
    | 'messages'
    | 'processes'
    | 'workPages'
    | 'runs'
    | 'subagents'
    | 'tools'
    | 'onOpenSubagent'
  >,
) {
  const [{ view, details, selectedId }, update] = useConversationWorkState(props.sessionId ?? '');
  const [relationshipsOpened, setRelationshipsOpened] = useState(view === 'relationships');
  const hasFamily =
    conversationFamily(props.sessions ?? [], props.sessionId ?? '').sessions.length > 1;
  const relationships = view === 'relationships';
  const header = (
    <div
      data-slot="conversation-work-header"
      className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2"
    >
      <h3 className="text-xs font-semibold">Conversations &amp; delegated work</h3>
      <div className="flex items-center gap-1">
        {!relationships && hasFamily ? (
          <Button size="sm" variant="ghost" onClick={() => update({ details: !details })}>
            {details ? 'Family' : 'Execution details'}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          aria-label={relationships ? 'Switch to Gantt' : 'Switch to Relationships'}
          onClick={() => {
            setRelationshipsOpened(true);
            update({ view: relationships ? 'gantt' : 'relationships' });
          }}
        >
          <GitForkIcon />
          Relationships
          <ArrowLeftRightIcon />
        </Button>
      </div>
    </div>
  );
  return (
    <div className="@container min-w-0">
      <div hidden={relationships}>
        {hasFamily && !details ? (
          <ConversationGantt
            header={header}
            selectedId={selectedId}
            onSelect={(selectedId) => update({ selectedId })}
            onOpenArtifact={props.onOpenArtifact}
            sessions={props.sessions ?? []}
            sessionId={props.sessionId ?? ''}
            provenance={props.familyProvenance}
            pending={props.familyProvenancePending}
          />
        ) : (
          <>
            {header}
            <ClioProcessLanes {...props} />
          </>
        )}
      </div>
      {relationshipsOpened ? (
        <div hidden={!relationships}>
          <ConversationRelationships
            sessions={props.sessions ?? []}
            sessionId={props.sessionId ?? ''}
            header={header}
            onOpenArtifact={props.onOpenArtifact}
            selectedId={selectedId}
            onSelect={(selectedId) => update({ selectedId })}
          />
        </div>
      ) : null}
      <TaskPageContinuation pagination={props.workPages} />
    </div>
  );
}
