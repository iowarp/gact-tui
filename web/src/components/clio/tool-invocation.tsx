import { toolResultRecord, asRecord } from './tool-result-shared';
import type {
  AttentionBlock,
  PendingInteraction,
  SubagentRun,
  ToolInvocation,
  WorkspaceResource,
} from '@clio/core/v3';
import { lazy, Suspense, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Collapsible } from '@/components/ui/collapsible';
import { ClioAttentionToolBadge } from './attention-tool-badge';
import { ToolResultPresentation } from './tool-result-presentation';
import { NestedToolCalls, UnlessNestedCalls } from './nested-tool-calls';
import { DelegateCalls } from './delegate-calls';
import { delegateTone } from './delegate-tone';
import { TranscriptDiffBody, TranscriptTerminalBody } from './transcript-tool-bodies';
import { ToolDetailsContent } from './tool-details-content';
import { PresentationLink } from './presentation-link';
import {
  getToolSubject,
  getToolStatus,
  getToolFailureDetail,
  isA2uiCatalogLookup,
  withStoppedOutcome,
} from './tool-presentation';
import { flowToolDescriptor } from './flow-tool-presentation';
import { PresentationNavigation } from './presentation-navigation';
import { focusAttentionEvidence } from '@/lib/attention-evidence-navigation';
import { ToolCompactRow } from './tool-compact-row';
import { WaitingForYou } from './agent-answer-activity';
import { withPermissionDecision } from './agent-answer-domain';
import { ActivityInfoButton } from './activity-row';
import { TechnicalDetailsLink, ToolTechnicalDetailsDialog } from './tool-technical-details';
import { useToolDuration } from './use-tool-duration';
import { sandboxBoundary } from './sandbox-boundary';
import { SandboxBoundaryBadge } from './sandbox-boundary-notice';
import { withTaskWaitInterruption } from './task-wait-presentation';
import { withTodoPresentation } from './todo-tool-presentation';
import { withStorageToolPresentation } from './storage-tool-presentation';
import { withSkillPresentation } from './skill-tool-presentation';
import { answeredQuestionReading, withQuestionPresentation } from './question-tool-presentation';
import { QuestionAnswerReader } from './question-answer-reader';
import { useQuestionAnswer } from './question-answer-context';
import {
  agentMessageName,
  sentAgentMessage,
  withAgentMessagePresentation,
} from './agent-message-presentation';
import { useLiveStore } from '@/store/live-store';
import { toolOperation } from './tool-operation';
import { ToolOperationResult } from './tool-operation-result';
import { withOperationOutcome } from './tool-operation-outcome';

const OperationFlow = lazy(() =>
  import('./flow-run-card').then((module) => ({ default: module.FlowRunCard })),
);

export function ClioToolInvocation({
  attention,
  attentionFields,
  sessionId,
  tool,
  defaultOpen,
  compact = false,
  surface = 'transcript',
  flowResult = true,
  waitingFor,
}: {
  tool?: ToolInvocation;
  /** The user's pending answer this call is paused on; its row says "waiting for you". */
  waitingFor?: PendingInteraction;
  defaultOpen?: boolean;
  embedded?: boolean;
  compact?: boolean;
  /** Evidence reuses the same results with its own list density and kind/status glyphs. */
  surface?: 'transcript' | 'evidence';
  /** A conversation boundary may already own this flow's card. */
  flowResult?: boolean;
  /** Attention-mode badge: this tool call's share of the selection's attention, and its intensity bucket. */
  attention?: { share: number; bucket: number };
  attentionFields?: readonly AttentionBlock[];
  sessionId?: string;
}) {
  const navigation = useContext(PresentationNavigation);
  const questionContext = useQuestionAnswer();
  const sentMessage = sentAgentMessage(tool);
  const recipientTitle = useLiveStore(
    (state) => state.entities.sessions[sentMessage?.sessionId ?? sentMessage?.target ?? '']?.title,
  );
  const [open, setOpen] = useState(false);
  const infoRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  // The dialog has no Radix trigger, so closing it returns focus to the ⓘ that opened it.
  useEffect(() => {
    if (wasOpen.current && !open) infoRef.current?.focus();
    wasOpen.current = open;
  }, [open]);
  const [resultOpen, setResultOpen] = useState(
    defaultOpen ?? (!compact && !['cancelled', 'interrupted'].includes(tool?.state ?? '')),
  );
  const duration = useToolDuration(tool);
  const boundary = sandboxBoundary(tool?.output);
  useEffect(() => {
    let frame = 0;
    const inspect = () => {
      const [target, raw] = window.location.hash.split('?');
      const query = new URLSearchParams(raw);
      const field = attentionFields?.find(
        (entry) =>
          target === `#message-${encodeURIComponent(entry.message_id)}` &&
          entry.part_id === query.get('part') &&
          entry.field === query.get('field') &&
          entry.content_revision === query.get('revision') &&
          ['input', 'result'].includes(entry.field),
      );
      if (!field) return;
      setOpen(true);
      frame = requestAnimationFrame(() => focusAttentionEvidence(field.message_id, query));
    };
    inspect();
    window.addEventListener('hashchange', inspect);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', inspect);
    };
  }, [attentionFields]);
  if (!tool) return <p className="text-sm text-muted-foreground">Tool details unavailable</p>;
  const flow = flowToolDescriptor(tool);
  const openFlow =
    flow?.handle && navigation?.onOpenFlow
      ? () => navigation.onOpenFlow?.(flow.handle!, `${flow.label} run`)
      : undefined;
  const presentedTool = withStoppedOutcome(
    withOperationOutcome(
      withAgentMessagePresentation(
        withQuestionPresentation(
          withMemoryPresentation(
            withResourcePresentation(
              withSkillPresentation(
                withTaskWaitInterruption(
                  withTodoPresentation(
                    withStorageToolPresentation(
                      withPermissionDecision(tool, questionContext?.interactions),
                    ),
                  ),
                ),
              ),
              navigation?.resources,
            ),
          ),
          questionContext?.interactions,
        ),
        agentMessageName(
          sentMessage?.sessionId ?? sentMessage?.target,
          navigation?.subagents,
          recipientTitle,
        ),
      ),
    ),
  );
  const subject = getToolSubject(presentedTool);
  const operation = toolOperation(presentedTool, { subagents: navigation?.subagents });
  if (flow?.handle) {
    operation.expandable =
      flowResult ||
      Boolean(
        tool.error ||
          presentedTool.presentation?.blocks.some((block) => block.severity === 'error'),
      );
    operation.subjects = [{ id: 'flow-subject', type: 'text', label: flow.label }];
  }
  const catalogContent = isA2uiCatalogLookup(presentedTool)
    ? (presentedTool.presentation?.blocks ?? [])
        .filter(
          (block) =>
            block.id !== presentedTool.presentation?.subject &&
            !['skill-identity', 'skill-description'].includes(block.id) &&
            !block.id.startsWith('skill-file-') &&
            ['markdown', 'text', 'code'].includes(block.type) &&
            (block.text || block.content_ref),
        )
        .map((block) =>
          block.text?.trimStart().startsWith('{')
            ? { ...block, type: 'code' as const, language: 'json' }
            : block,
        )
    : [];
  const status = getToolStatus(presentedTool);
  // A call paused on the person has no outcome yet, whatever a reload projected.
  const failure =
    waitingFor || tool.state === 'pending' ? undefined : getToolFailureDetail(presentedTool);
  const declaredFailure = presentedTool.presentation?.blocks.some(
    (block) => block.severity === 'error' && (block.text?.trim() || block.content_ref),
  );

  const actionLabel = operation.action;
  const active = status === 'running' || status === 'pending';
  // A stopped call is not an error; its declared outcome already says how it ended.
  const stopped = status === 'cancelled' || status === 'interrupted';
  const declaredOutcome = presentedTool.presentation?.blocks.some(
    (block) => block.severity && block.text?.trim(),
  );
  const expanded = resultOpen && operation.expandable;
  const blocks = presentedTool.presentation?.blocks ?? [];
  const contentBlocks = blocks.filter((block) => block.id !== subject?.id);
  // In the transcript a file change or a command reads as the spec's compact body.
  const terminalBlocks = contentBlocks.filter((block) => block.type === 'terminal');
  const terminalOutput = terminalBlocks[0]?.text ?? '';
  const outputCarries = (text?: string) =>
    !text?.trim() || terminalOutput.includes(text.trim().split('\n').at(-1)!.trim());
  // A failed command keeps its command and output; its error shows only when the output lacks it.
  // A stopped command shows its Stopped outcome in the same place.
  const outcomeBlock = (block: (typeof contentBlocks)[number]) =>
    block.type !== 'terminal' &&
    (block.severity === 'error' || (stopped && block.severity === 'warning'));
  const outcomeText = contentBlocks.find(
    (block) => outcomeBlock(block) && !outputCarries(block.text),
  )?.text;
  const failureText = failure && !outputCarries(failure) ? failure : undefined;
  const terminalFailure = stopped ? (outcomeText ?? failureText) : (failureText ?? outcomeText);
  const compactBody =
    surface !== 'evidence' && operation.kind === 'declared'
      ? !failure &&
        !declaredFailure &&
        contentBlocks.length === 1 &&
        contentBlocks[0]!.type === 'diff' &&
        contentBlocks[0]!.text
        ? ({ kind: 'diff', block: contentBlocks[0]! } as const)
        : terminalBlocks.length === 1 &&
            contentBlocks.every((block) => block.type === 'terminal' || outcomeBlock(block))
          ? ({ kind: 'terminal', block: terminalBlocks[0]! } as const)
          : undefined
      : undefined;
  // One delegate's row already names the agent and its task; opened, it shows the child's calls.
  const delegateOnly =
    operation.kind === 'assignments' &&
    operation.tasks?.length === 1 &&
    !operation.tasks[0]!.error &&
    !failure;
  // The child's calls live in its own session; a run without one keeps the parent's nested calls.
  const delegateChild = delegateOnly
    ? delegateRun(operation.tasks![0]!.key, tool, navigation?.subagents)
    : undefined;
  // An opened script lists the calls it made; its source alone is not repeated above them.
  const sourceOnly =
    surface !== 'evidence' &&
    operation.kind === 'declared' &&
    !flow?.handle &&
    !failure &&
    !declaredFailure &&
    contentBlocks.length > 0 &&
    contentBlocks.every((block) => block.type === 'code');
  const questionReading =
    surface !== 'evidence'
      ? answeredQuestionReading(tool, questionContext?.interactions)
      : undefined;
  const gateSource = (node: ReactNode) =>
    sourceOnly ? <UnlessNestedCalls parentId={tool.id}>{node}</UnlessNestedCalls> : node;
  return (
    <div
      className="min-w-0 scroll-m-6 rounded-[6px] focus:outline-2 focus:outline-offset-2 focus:outline-primary"
      data-slot="tool-activity"
      id={`${surface === 'evidence' ? 'evidence-tool' : 'tool'}-${tool.id}`}
      tabIndex={-1}
    >
      <Collapsible open={expanded} onOpenChange={setResultOpen}>
        <ToolCompactRow
          tool={presentedTool}
          operation={operation}
          onOpenFlow={openFlow}
          expanded={resultOpen}
          onExpandedChange={setResultOpen}
          duration={duration}
          surface={surface}
          waiting={
            waitingFor || tool.state === 'pending' ? (
              <WaitingForYou interaction={waitingFor} />
            ) : undefined
          }
          // A call the sandbox blocked says so before it is opened (#1905).
          badge={boundary ? <SandboxBoundaryBadge boundary={boundary} /> : undefined}
          attention={
            attention ? (
              <ClioAttentionToolBadge bucket={attention.bucket} share={attention.share} />
            ) : null
          }
          info={
            <ActivityInfoButton
              ref={infoRef}
              label={`Technical details for ${actionLabel}`}
              onClick={() => setOpen(true)}
            />
          }
        />
        {expanded && questionReading ? (
          <ToolDetailsContent inline flush title={`${actionLabel}: Result`}>
            <QuestionAnswerReader reading={questionReading} />
          </ToolDetailsContent>
        ) : expanded && compactBody ? (
          <ToolDetailsContent inline flush title={`${actionLabel}: Result`}>
            {compactBody.kind === 'diff' ? (
              <TranscriptDiffBody block={compactBody.block} subject={subject} />
            ) : (
              <TranscriptTerminalBody
                tool={presentedTool}
                block={compactBody.block}
                live={active}
                failure={terminalFailure}
                failed={status === 'failed'}
              />
            )}
          </ToolDetailsContent>
        ) : expanded && !delegateOnly ? (
          gateSource(
            <ToolDetailsContent
              inline
              title={`${actionLabel}: Result`}
              bounded={
                !presentedTool.presentation?.blocks.some((block) => block.type === 'terminal')
              }
            >
              {failure && !declaredFailure && !(stopped && declaredOutcome) ? (
                <p
                  role={stopped ? undefined : 'alert'}
                  className={`whitespace-pre-wrap [overflow-wrap:anywhere] ${stopped ? 'text-muted-foreground' : status === 'unknown' || status === 'denied' ? 'text-warning' : 'text-destructive'}`}
                >
                  {failure.length > 1200 ? `${failure.slice(0, 1200)}…` : failure}
                </p>
              ) : null}
              {flowResult && flow?.handle && (sessionId || tool.session_id) ? (
                <Suspense fallback={<p role="status">Loading flow…</p>}>
                  <OperationFlow
                    flow={{ ...flow, handle: flow.handle }}
                    sessionId={sessionId || tool.session_id}
                  />
                </Suspense>
              ) : operation.kind !== 'declared' ? (
                <ToolOperationResult operation={operation} tool={presentedTool} />
              ) : isA2uiCatalogLookup(presentedTool) && status === 'succeeded' ? (
                <p className="text-muted-foreground">
                  Widget catalog loaded. Use technical details to inspect the full catalog.
                </p>
              ) : (
                <ToolResultPresentation
                  tool={withoutRowQuery(presentedTool, operation.query)}
                  subjectId={subject?.id}
                  summaryInHeader
                />
              )}
              {operation.scope ? (
                <p className="text-muted-foreground">
                  Scope: <PresentationLink block={operation.scope} />
                </p>
              ) : null}
            </ToolDetailsContent>,
          )
        ) : null}
        {/* A script's own tool calls are rows one step in under it, not repeated in its result. */}
        {expanded && delegateChild ? (
          <DelegateCalls
            name={operation.subjects[0]?.label || delegateChild.title || 'Child agent'}
            result={
              delegateTone(delegateChild.state) === 'running' ? undefined : delegateChild.result
            }
            subagent={delegateChild}
          />
        ) : expanded ? (
          <NestedToolCalls parentId={tool.id} renderCall={renderNestedCall} />
        ) : null}
      </Collapsible>
      {open ? (
        <ToolTechnicalDetailsDialog
          open={open}
          onOpenChange={setOpen}
          tool={tool}
          title={`${actionLabel}: Technical details`}
          duration={duration}
          active={active}
          boundary={boundary}
          link={
            compact ? (
              <TechnicalDetailsLink
                onOpenFlow={openFlow}
                flowLabel={flow?.label}
                subject={openFlow ? undefined : subject}
                onClose={() => setOpen(false)}
              />
            ) : null
          }
          catalogContent={catalogContent}
          attentionFields={attentionFields}
          sessionId={sessionId}
        />
      ) : null}
    </div>
  );
}
const MEMORY_ACTIONS: Record<string, string> = {
  session_search: 'Search past sessions',
  session_read_summary: 'Read session summary',
  session_read_context_frame: 'Read retained context',
  memory_search: 'Search memory',
  memory_read: 'Read memory',
  create_memory: 'Remember',
  update_memory: 'Correct memory',
  forget_memory: 'Forget',
  propose_memory_change: 'Propose memory change',
};

/** The query the row already says (`for “…”`) is not repeated as a block in its result. */
function withoutRowQuery(tool: ToolInvocation, query: string | undefined): ToolInvocation {
  if (!query || !tool.presentation) return tool;
  const blocks = tool.presentation.blocks.filter(
    (block) => !(block.type === 'text' && block.text === query && !block.severity),
  );
  return blocks.length === tool.presentation.blocks.length
    ? tool
    : { ...tool, presentation: { ...tool.presentation, blocks } };
}

/** The run a single delegate launched, by its task handle or the child session it returned. */
function delegateRun(
  handle: string,
  tool: ToolInvocation,
  subagents: Record<string, SubagentRun> | undefined,
): SubagentRun | undefined {
  if (!subagents) return undefined;
  const sessionId = asRecord(tool.output)?.child_session_id;
  const run =
    subagents[handle] ??
    Object.values(subagents).find(
      (row) => typeof sessionId === 'string' && row.child_session_id === sessionId,
    );
  return run?.child_session_id ? run : undefined;
}

function renderNestedCall(child: ToolInvocation) {
  return <ClioToolInvocation tool={child} compact />;
}

function withMemoryPresentation(tool: ToolInvocation): ToolInvocation {
  const action = MEMORY_ACTIONS[tool.name];
  if (!action || !tool.presentation) return tool;
  const row = toolResultRecord(tool.output);
  const notice = asRecord(row?.memory);
  const label =
    typeof row?.description === 'string'
      ? row.description
      : typeof notice?.description === 'string'
        ? notice.description
        : undefined;
  const blocks = tool.presentation.blocks.map((block) =>
    block.target === 'memory'
      ? {
          ...block,
          label:
            label ||
            (block.label || block.uri || '').split('#')[0]!.split('/').at(-1)?.replaceAll('-', ' '),
        }
      : block,
  );
  return {
    ...tool,
    presentation: {
      ...tool.presentation,
      action,
      subject: blocks.some((block) => block.id === 'memory') ? 'memory' : tool.presentation.subject,
      blocks,
    },
  };
}

function withResourcePresentation(
  tool: ToolInvocation,
  workspaceResources?: Record<string, WorkspaceResource>,
): ToolInvocation {
  if (
    tool.name !== 'workspace_resource_list' &&
    tool.name !== 'workspace_resource_wait' &&
    tool.name !== 'workspace_resource_inspect' &&
    tool.name !== 'workspace_resource_read' &&
    tool.name !== 'workspace_resource_search' &&
    tool.name !== 'workspace_resource_structure'
  )
    return tool;
  const resources =
    tool.name === 'workspace_resource_list'
      ? (tool.presentation?.blocks.filter((block) => block.target === 'resource') ?? [])
      : [];
  const result = toolResultRecord(tool.output);
  const matches = Array.isArray(result?.matches) ? result.matches : undefined;
  const processing = asRecord(result?.processing);
  const input = asRecord(tool.input);
  const taskId = typeof input?.task_id === 'string' ? input.task_id : '';
  const taskResourceId = /^resource-processing:(res_[^:]+):/u.exec(taskId)?.[1];
  const waitResourceId =
    tool.name === 'workspace_resource_wait' && typeof processing?.resource_id === 'string'
      ? processing.resource_id
      : tool.name === 'workspace_resource_wait'
        ? taskResourceId
        : undefined;
  const waitResource = waitResourceId ? workspaceResources?.[waitResourceId] : undefined;
  const waitSubject =
    waitResourceId && waitResource
      ? {
          id: 'wait-resource',
          type: 'link' as const,
          target: 'resource' as const,
          uri: waitResourceId,
          label: waitResource.name,
        }
      : undefined;
  return {
    ...tool,
    presentation: tool.presentation
      ? {
          ...tool.presentation,
          action:
            tool.name === 'workspace_resource_list'
              ? 'List workspace resources'
              : tool.name === 'workspace_resource_wait'
                ? 'Await conversion'
                : tool.name === 'workspace_resource_inspect'
                  ? 'Inspect resource'
                  : tool.name === 'workspace_resource_search'
                    ? 'Search resource'
                    : tool.name === 'workspace_resource_structure'
                      ? 'Inspect structure'
                      : 'Read resource',
          subject:
            tool.name === 'workspace_resource_list'
              ? undefined
              : waitSubject?.id || tool.presentation.subject,
          summary:
            tool.name === 'workspace_resource_list' && resources.length
              ? `${resources.length} workspace ${resources.length === 1 ? 'resource' : 'resources'} found`
              : tool.name === 'workspace_resource_search' && matches
                ? `${matches.length} ${matches.length === 1 ? 'match' : 'matches'}`
                : tool.name === 'workspace_resource_search'
                  ? tool.presentation.summary.replace(/^(\d+)\s+(matches?)\s+for\s+.+$/u, '$1 $2')
                  : tool.presentation.summary,
          blocks: waitSubject
            ? [waitSubject, ...tool.presentation.blocks]
            : tool.presentation.blocks,
        }
      : tool.presentation,
  };
}
