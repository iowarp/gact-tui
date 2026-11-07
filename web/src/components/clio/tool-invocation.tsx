import { toolResultRecord, asRecord } from './tool-result-shared';
import type { AttentionBlock, ToolInvocation, WorkspaceResource } from '@clio/core/v3';
import { InfoIcon } from '@/lib/icon-vocabulary';
import { lazy, Suspense, useContext, useEffect, useState } from 'react';
import { ToolInput, ToolOutput } from '@/components/ai-elements/tool';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { Collapsible } from '@/components/ui/collapsible';
import { ClioAttentionToolBadge } from './attention-tool-badge';
import { ToolResultPresentation } from './tool-result-presentation';
import { NestedToolCalls } from './nested-tool-calls';
import { ToolDetailsContent } from './tool-details-content';
import { PresentationLink } from './presentation-link';
import {
  getToolSubject,
  getToolStatus,
  getToolFailureDetail,
  isA2uiCatalogLookup,
} from './tool-presentation';
import { PagedBlock } from './tool-result-primitives';
import { flowToolDescriptor } from './flow-tool-presentation';
import { PresentationNavigation } from './presentation-navigation';
import { ToolAttentionField } from './tool-attention-fields';
import { focusAttentionEvidence } from '@/lib/attention-evidence-navigation';
import { ToolCompactRow } from './tool-compact-row';
import { useToolDuration } from './use-tool-duration';
import { sandboxBoundary } from './sandbox-boundary';
import { SandboxBoundaryBadge } from './sandbox-boundary-notice';
import { formatDuration } from '@/lib/format';
import { withTaskWaitInterruption } from './task-wait-presentation';
import { withTodoPresentation } from './todo-tool-presentation';
import { withStorageToolPresentation } from './storage-tool-presentation';
import { withSkillPresentation } from './skill-tool-presentation';
import { withQuestionPresentation } from './question-tool-presentation';
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
}: {
  tool?: ToolInvocation;
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
  const presentedTool = withOperationOutcome(
    withAgentMessagePresentation(
      withQuestionPresentation(
        withMemoryPresentation(
          withResourcePresentation(
            withSkillPresentation(
              withTaskWaitInterruption(withTodoPresentation(withStorageToolPresentation(tool))),
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
  const failure = getToolFailureDetail(presentedTool);
  const declaredFailure = presentedTool.presentation?.blocks.some(
    (block) => block.severity === 'error' && (block.text?.trim() || block.content_ref),
  );

  const actionLabel = operation.action;
  const detailsTrigger = (
    <DialogTrigger asChild>
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-5 shrink-0"
        aria-label={`Technical details for ${actionLabel}`}
        title="View command, input, result, and timing"
      >
        <InfoIcon className="size-4" />
      </Button>
    </DialogTrigger>
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div
        className="flex min-w-0 scroll-m-6 flex-col gap-0.5 rounded-sm focus:outline-2 focus:outline-offset-2 focus:outline-primary"
        data-slot="tool-activity"
        id={`${surface === 'evidence' ? 'evidence-tool' : 'tool'}-${tool.id}`}
        tabIndex={-1}
      >
        <Collapsible open={resultOpen && operation.expandable} onOpenChange={setResultOpen}>
          <div className="flex min-w-0 items-center gap-1">
            <ToolCompactRow
              tool={presentedTool}
              operation={operation}
              onOpenFlow={openFlow}
              expanded={resultOpen}
              duration={duration}
              surface={surface}
              attention={
                attention || boundary ? (
                  <>
                    {/* A call the sandbox blocked says so before it is opened (#1905). */}
                    {boundary ? <SandboxBoundaryBadge boundary={boundary} /> : null}
                    {attention ? (
                      <ClioAttentionToolBadge bucket={attention.bucket} share={attention.share} />
                    ) : null}
                  </>
                ) : null
              }
            />
            {detailsTrigger}
          </div>
          {resultOpen && operation.expandable ? (
            <ToolDetailsContent
              inline
              title={`${actionLabel}: Result`}
              bounded={
                !presentedTool.presentation?.blocks.some((block) => block.type === 'terminal')
              }
            >
              {failure && !declaredFailure ? (
                <p
                  role="alert"
                  className={`whitespace-pre-wrap [overflow-wrap:anywhere] ${status === 'unknown' ? 'text-warning' : 'text-destructive'}`}
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
              {/* A script's own tool calls are rows under its result, not repeated in it. */}
              <NestedToolCalls parentId={tool.id} renderCall={renderNestedCall} />
              {operation.scope ? (
                <p className="ml-7 text-sm text-muted-foreground">
                  Scope: <PresentationLink block={operation.scope} />
                </p>
              ) : null}
            </ToolDetailsContent>
          ) : null}
        </Collapsible>
        <ToolDetailsContent inline={false} title={`${actionLabel}: Technical details`}>
          {duration !== undefined ? (
            <p className="text-sm tabular-nums text-muted-foreground">
              {status === 'running' || status === 'pending' ? 'Elapsed time' : 'Execution time'}:{' '}
              {formatDuration(duration, 'tenths')}
            </p>
          ) : null}
          {compact && openFlow ? (
            <Button
              variant="link"
              className="h-auto justify-start p-0"
              onClick={() => {
                setOpen(false);
                openFlow();
              }}
            >
              Open {flow!.label.toLowerCase()} run
            </Button>
          ) : compact && subject ? (
            <PresentationLink block={subject} />
          ) : null}
          {open && catalogContent.length ? (
            <section aria-label="Loaded widget catalog" className="min-w-0 space-y-2">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Loaded content
              </h4>
              <PagedBlock
                block={catalogContent[0]}
                groupedBlocks={catalogContent}
                lines={20}
                full
              />
            </section>
          ) : null}
          {attentionFields?.some((entry) => entry.kind === 'tool_input') ? (
            attentionFields
              .filter((entry) => entry.kind === 'tool_input')
              .map((block) => (
                <ToolAttentionField
                  key={`${block.part_id}:${block.field}`}
                  block={block}
                  tool={tool}
                  sessionId={sessionId}
                />
              ))
          ) : tool.input !== undefined ? (
            <ToolInput input={(tool.input ?? {}) as never} />
          ) : null}
          {attentionFields?.some((entry) => entry.kind === 'tool_result') ? (
            attentionFields
              .filter((entry) => entry.kind === 'tool_result')
              .map((block) => (
                <ToolAttentionField
                  key={`${block.part_id}:${block.field}`}
                  block={block}
                  tool={tool}
                  sessionId={sessionId}
                />
              ))
          ) : (
            <ToolOutput
              errorText={tool.error as never}
              // Preserve explicit JSON scalars that ToolOutput would otherwise
              // treat as an absent result (false, zero, null or an empty string).
              output={
                (tool.output !== undefined && !tool.output
                  ? JSON.stringify(tool.output)
                  : tool.output) as never
              }
            />
          )}
          {attentionFields?.some((entry) => entry.kind === 'tool_result') && tool.error ? (
            <p role="alert">{String(tool.error)}</p>
          ) : null}
          {tool.execution_task && attentionFields?.some((entry) => entry.kind === 'tool_result') ? (
            <section aria-label="Execution result">
              <p>Execution result</p>
              <ToolOutput output={tool.output as never} errorText={tool.error} />
            </section>
          ) : null}
          {tool.presentation?.diagnostic ? <p>{tool.presentation.diagnostic}</p> : null}
          {tool.submission ? (
            <details>
              <summary className="cursor-pointer">Submission response</summary>
              <ToolOutput
                output={tool.submission.output as never}
                errorText={tool.submission.error}
              />
            </details>
          ) : null}
        </ToolDetailsContent>
      </div>
    </Dialog>
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
