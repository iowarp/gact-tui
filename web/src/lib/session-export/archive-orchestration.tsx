import type { ScienceEntry } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  conversationForkOrigin,
  forkAuthorLabel,
} from '@/components/clio/conversation-fork-origin';
import { ContentMarkdown } from '@/components/clio/content-markdown';
import { messageForCall } from '@/components/clio/science-log-model';
import { ScienceLogView } from '@/components/clio/science-log-tab';
import { StudyViews } from '@/components/clio/study-views';
import { ClioStatus } from '@/components/clio/status';
import { useRepository } from '@/hooks/use-repository';
import { useScienceLog } from '@/hooks/use-science-log';
import { MODEL_CHOICE_SOURCE } from '@/lib/flow-run-usage';
import type { ArchiveTranscriptView } from './archive-conversation';
import {
  archiveFileHref,
  archiveFolderPath,
  type ArchiveFileInventory,
} from './archive-file-reference';
import {
  archiveDelegatedAssignment,
  archiveFinalAnswer,
  archiveSubagentSpawn,
  decodedMessages,
  type ArchiveSpawnCall,
  type ArchiveSessionRow,
  type ArchiveTarget,
} from './archive-orchestration-model';

/**
 * What a child session is in the archive, above its transcript: how it was
 * reached (delegated or forked, and by whom), its agent and model, what it was
 * asked and what it returned, with a link back to where it was started. The
 * parent's subagent record is used when the export has one; otherwise the call
 * that started the child (`call`) and the child's own last answer say the same.
 */
export function ArchiveSessionHeader({
  row,
  parentTitle,
  parentView,
  call,
  flowCall,
  view,
  onOpen,
}: {
  row: ArchiveSessionRow;
  /** The title of the session that started this one. */
  parentTitle: string;
  parentView?: ArchiveTranscriptView;
  /** The recorded call that started this session, when an exported session made it. */
  call?: ArchiveSpawnCall;
  /**
   * The call that started the flow run this session is a step or member of,
   * when its parent is that run: the way back is to the run's railroad.
   */
  flowCall?: ArchiveSpawnCall;
  /** This session's own transcript, for the answer it returned. */
  view?: ArchiveTranscriptView;
  onOpen: (target: ArchiveTarget) => void;
}) {
  const repository = useRepository();
  const sessionId = row.session.id;
  const session = useQuery({
    queryKey: ['archive-session-record', sessionId],
    queryFn: ({ signal }) => repository.sessionRecord(sessionId, signal),
    retry: false,
    staleTime: Infinity,
  });
  const relationship = row.relationship;
  const spawn = useMemo(() => archiveSubagentSpawn(sessionId, parentView), [parentView, sessionId]);
  const answer = useMemo(() => archiveFinalAnswer(view), [view]);
  const delegated = useMemo(() => archiveDelegatedAssignment(view), [view]);
  // A flow's step records why it runs on its model in its task (captured for flow runs).
  const taskId = relationship?.task_id;
  const task = useQuery({
    queryKey: ['archive-agent-task', taskId],
    queryFn: ({ signal }) => repository.agentTask(taskId!, signal),
    enabled: Boolean(taskId) && !call?.model,
    retry: false,
    staleTime: Infinity,
  });
  if (!relationship && !call) return null;
  const origin = conversationForkOrigin(session.data);
  const forked =
    relationship?.attribution === 'session_fork' || Boolean(origin) || Boolean(call?.forked);
  const author = forkAuthorLabel(origin);
  const subagent = spawn.subagent;
  const agent = subagent?.agent_id || session.data?.agent_id || call?.agent || '';
  const choice = subagent?.model_choice ?? call?.model ?? task.data?.model_choice ?? undefined;
  const why = choice ? (MODEL_CHOICE_SOURCE[choice.source] ?? choice.source) : '';
  const ran = [session.data?.provider_id, session.data?.model_id].filter(Boolean).join(' / ');
  const model = ran && why ? `${ran} (${why})` : ran;
  const state = subagent?.state ?? session.data?.state;
  const assignment = subagent?.task || call?.assignment || delegated;
  const result = subagent?.result || answer;
  const back: ArchiveTarget = call
    ? { sessionId: call.sessionId, messageId: call.messageId, callId: call.callId }
    : flowCall && !spawn.messageId
      ? { sessionId: flowCall.sessionId, messageId: flowCall.messageId, callId: flowCall.callId }
      : { sessionId: relationship!.parent_session_id, messageId: spawn.messageId };
  const viaFlow = !call && flowCall?.flow && back.sessionId === flowCall.sessionId;
  return (
    <header
      aria-label={`How ${row.session.title || sessionId} was started`}
      className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm"
      data-slot="archive-session-origin"
    >
      {viaFlow ? (
        <p>
          {'Delegated by the '}
          <button className="font-medium underline" onClick={() => onOpen(back)} type="button">
            {flowCall!.flow} run
          </button>
          {' — back to where it was drawn'}
        </p>
      ) : (
        <p>
          {forked ? 'Forked from ' : 'Delegated by '}
          <button className="font-medium underline" onClick={() => onOpen(back)} type="button">
            {parentTitle || back.sessionId}
          </button>
          {back.messageId ? ' — back to where it was started' : ''}
        </p>
      )}
      {author ? <p>{author}</p> : null}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
        {agent ? (
          <>
            <dt className="text-muted-foreground">Agent</dt>
            <dd>{agent}</dd>
          </>
        ) : null}
        {model ? (
          <>
            <dt className="text-muted-foreground">Model</dt>
            <dd>{model}</dd>
          </>
        ) : null}
        {state ? (
          <>
            <dt className="text-muted-foreground">State</dt>
            <dd>
              <ClioStatus value={state} />
            </dd>
          </>
        ) : null}
        {assignment ? (
          <>
            <dt className="text-muted-foreground">{forked ? 'Fork note' : 'Assignment'}</dt>
            <dd className="max-h-48 overflow-y-auto whitespace-pre-wrap">{assignment}</dd>
          </>
        ) : null}
        {result ? (
          <>
            <dt className="text-muted-foreground">Result</dt>
            <dd className="min-w-0">
              <ContentMarkdown className="max-h-48 overflow-y-auto text-xs leading-5">
                {result}
              </ContentMarkdown>
            </dd>
          </>
        ) : null}
      </dl>
    </header>
  );
}

/**
 * The study's Science log in the archive: its views, tree and log, with
 * citations followable to the entry and to the transcript turn that wrote it;
 * each Observation's sources and each analysis followable to the cited call's
 * turn, cited files and node folders linked to the files the export includes.
 */
export function ArchiveScienceLog({
  sessionId,
  views,
  inventory,
  onOpen,
  onOpenFolder,
}: {
  sessionId: string;
  views: Readonly<Record<string, ArchiveTranscriptView>>;
  /** The export's included files, to link cited files and node folders to them. */
  inventory?: ArchiveFileInventory;
  onOpen: (target: ArchiveTarget) => void;
  /** Show an included folder's files (the export's Files section). */
  onOpenFolder?: (path: string) => void;
}) {
  const log = useScienceLog(sessionId);
  if (!log.data?.in_study) return null;
  const study = log.data;
  const viewInTranscript = (entry: ScienceEntry) => {
    const session = entry.session || entry.branch;
    if (!session) return;
    const messageId = entry.invocation
      ? messageForCall(decodedMessages(views[session]), session, entry.invocation)
      : undefined;
    onOpen({ sessionId: session, messageId, callId: entry.invocation || undefined });
  };
  const viewCall = (session: string, callId: string) =>
    onOpen({
      sessionId: session,
      messageId: messageForCall(decodedMessages(views[session]), session, callId),
      callId,
    });
  return (
    <ScienceLogView
      onOpenTask={(handle) => {
        const branch = study.branches.find((row) => row.handle === handle);
        if (branch) onOpen({ sessionId: branch.session_id });
      }}
      fileHref={
        inventory
          ? (file) =>
              (file.artifactId
                ? archiveFileHref(`artifact://${file.artifactId}`, inventory)
                : undefined) ?? (file.path ? archiveFileHref(file.path, inventory) : undefined)
          : undefined
      }
      folderAvailable={(path) =>
        Boolean(inventory && archiveFolderPath(path, inventory) !== undefined)
      }
      onOpenFolder={onOpenFolder}
      onViewCall={viewCall}
      onViewInTranscript={viewInTranscript}
      sessionId={sessionId}
      study={study}
      views={study.views.length ? <StudyViews readOnly study={study} /> : undefined}
    />
  );
}
