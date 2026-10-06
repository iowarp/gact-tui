import type { AttentionBlock, ToolInvocation, WorkspaceResource } from '@clio/core/v3';
import { WorkflowIcon, WrenchIcon } from 'lucide-react';
import { InfoIcon } from '@/lib/icon-vocabulary';
import { useContext, useEffect, useState } from 'react';
import { ToolInput, ToolOutput } from '@/components/ai-elements/tool';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { ActivityRow } from './activity-row';
import { ClioAttentionToolBadge } from './attention-tool-badge';
import { ToolResultPresentation } from './tool-result-presentation';
import { ResultDialogContent } from './result-dialog-content';
import { PresentationLink } from './presentation-link';
import { getToolHeaderMetadata, getToolStatus, isA2uiCatalogLookup } from './tool-presentation';
import { withWorkflowPresentation, workflowDescriptor } from './workflow-tool-presentation';
import { PresentationNavigation } from './presentation-navigation';
import { ToolAttentionField } from './tool-attention-fields';
import { focusAttentionEvidence } from '@/lib/attention-evidence-navigation';

export function ClioToolInvocation({
  attention,
  attentionFields,
  sessionId,
  tool,
  defaultOpen,
}: {
  tool?: ToolInvocation;
  defaultOpen?: boolean;
  embedded?: boolean;
  /** Attention-mode badge: this tool call's share of the selection's attention, and its intensity bucket. */
  attention?: { share: number; bucket: number };
  attentionFields?: readonly AttentionBlock[];
  sessionId?: string;
}) {
  const navigation = useContext(PresentationNavigation);
  const [open, setOpen] = useState(defaultOpen ?? false);
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
  const workflow = workflowDescriptor(tool);
  const presentedTool = withMemoryPresentation(
    withResourcePresentation(
      withWorkflowPresentation(withSkillFileSubject(tool)),
      navigation?.resources,
    ),
  );
  const subject = presentedTool.presentation?.blocks.find(
    (block) =>
      block.id === presentedTool.presentation?.subject &&
      (block.type === 'link' || block.type === 'text'),
  );
  const status = getToolStatus(presentedTool);
  const headerMetadata = getToolHeaderMetadata(presentedTool);
  const actionLabel = isA2uiCatalogLookup(presentedTool)
    ? 'Inspect component schema'
    : presentedTool.presentation?.action || tool.title || tool.name;
  const summaryInHeader =
    Boolean(headerMetadata) && headerMetadata === presentedTool.presentation?.summary?.trim();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div
        className="flex min-w-0 scroll-m-6 flex-col gap-0.5 rounded-sm focus:outline-2 focus:outline-offset-2 focus:outline-primary"
        data-slot="tool-activity"
        id={`tool-${tool.id}`}
        tabIndex={-1}
      >
        <ActivityRow
          icon={workflow ? <WorkflowIcon className="size-4" /> : <WrenchIcon className="size-4" />}
          title={
            <span className="flex w-full min-w-0 items-center gap-1" data-slot="tool-action-label">
              <span className="mr-1 shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {workflow ? 'Workflow' : 'Tool'}
              </span>
              <span className="shrink-0">{actionLabel}</span>
              {subject ? (
                <>
                  <span aria-hidden="true">(</span>
                  {workflow && navigation?.onOpenWorkflow ? (
                    <Button
                      aria-label={`Open workflow ${workflow.label}`}
                      className="h-auto min-w-0 max-w-[42ch] shrink justify-start truncate p-0 text-left text-sm"
                      onClick={() => navigation.onOpenWorkflow?.(tool)}
                      title={workflow.label}
                      variant="link"
                    >
                      <span className="truncate">{workflow.label}</span>
                    </Button>
                  ) : (
                    <PresentationLink block={subject} compact />
                  )}
                  <span aria-hidden="true">)</span>
                </>
              ) : null}
            </span>
          }
          metadata={headerMetadata}
          status={status}
          duration={tool.duration_ms}
          attention={
            attention ? (
              <ClioAttentionToolBadge bucket={attention.bucket} share={attention.share} />
            ) : null
          }
          action={
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-5"
                aria-label={`Technical details for ${actionLabel}`}
                title="Technical details"
              >
                <InfoIcon className="size-4" />
              </Button>
            </DialogTrigger>
          }
        />
        <ToolResultPresentation
          tool={presentedTool}
          subjectId={subject?.id}
          summaryInHeader={summaryInHeader}
        />
        {tool.error &&
        !tool.presentation?.blocks.some(
          (block) => block.severity === 'error' || block.text === tool.error,
        ) ? (
          <p
            role="alert"
            className="ml-7 whitespace-pre-wrap text-sm text-destructive [overflow-wrap:anywhere]"
          >
            {tool.error}
          </p>
        ) : null}
        <ResultDialogContent
          title={`${actionLabel}: Technical details`}
          description="Original tool arguments, result, and diagnostics."
        >
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
            <ToolOutput errorText={tool.error as never} output={tool.output as never} />
          )}
          {attentionFields?.some((entry) => entry.kind === 'tool_result') && tool.error ? (
            <p role="alert">{String(tool.error)}</p>
          ) : null}
          {tool.presentation?.diagnostic ? <p>{tool.presentation.diagnostic}</p> : null}
        </ResultDialogContent>
      </div>
    </Dialog>
  );
}

function withMemoryPresentation(tool: ToolInvocation): ToolInvocation {
  const action =
    tool.name === 'memory_search_sessions'
      ? 'Search session memory'
      : tool.name === 'memory_read_session_summary'
        ? 'Read session summary'
        : tool.name === 'memory_read_context_frame'
          ? 'Read retained context'
          : undefined;
  if (!action || !tool.presentation) return tool;
  return {
    ...tool,
    presentation: { ...tool.presentation, action },
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

function withSkillFileSubject(tool: ToolInvocation): ToolInvocation {
  const presentation = tool.presentation;
  if (tool.name !== 'load_skill' || !presentation?.subject) return tool;
  const subject = presentation.blocks.find((block) => block.id === presentation.subject);
  if (!subject || subject.target === 'file' || (subject.type !== 'text' && subject.type !== 'link'))
    return tool;
  const result = toolResultRecord(tool.output);
  const path = typeof result?.path === 'string' ? result.path : '';
  if (!/^(?:[a-z]:[\\/]|\/)/iu.test(path)) return tool;
  const skillId = typeof result?.skill_id === 'string' ? result.skill_id : undefined;
  return {
    ...tool,
    presentation: {
      ...presentation,
      blocks: presentation.blocks.map((block) =>
        block.id === presentation.subject
          ? {
              ...block,
              type: 'link',
              target: 'file',
              uri: path,
              label: block.label || skillId || block.text || 'SKILL.md',
            }
          : block,
      ),
    },
  };
}

function toolResultRecord(value: unknown): Record<string, unknown> | undefined {
  const output = asRecord(value);
  if (!output) return undefined;
  return (
    asRecord(output.structuredContent) ??
    asRecord(output.structured_content) ??
    asRecord(output.result) ??
    output
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
