import type { ToolInvocation, WorkspaceResource } from '@clio/core/v3';
import { InfoIcon, WorkflowIcon, WrenchIcon } from 'lucide-react';
import { useContext } from 'react';
import { ToolInput, ToolOutput } from '@/components/ai-elements/tool';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { ActivityRow } from './activity-row';
import { ToolResultPresentation } from './tool-result-presentation';
import { ResultDialogContent } from './result-dialog-content';
import { PresentationLink } from './presentation-link';
import { getToolHeaderMetadata, getToolStatus } from './tool-presentation';
import { withWorkflowPresentation, workflowDescriptor } from './workflow-tool-presentation';
import { PresentationNavigation } from './presentation-navigation';

export function ClioToolInvocation({
  tool,
  defaultOpen,
}: {
  tool?: ToolInvocation;
  defaultOpen?: boolean;
  embedded?: boolean;
}) {
  const navigation = useContext(PresentationNavigation);
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
  const summaryInHeader =
    Boolean(headerMetadata) && headerMetadata === presentedTool.presentation?.summary?.trim();
  return (
    <Dialog defaultOpen={defaultOpen ?? false}>
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
              <span className="shrink-0">
                {presentedTool.presentation?.action || tool.title || tool.name}
              </span>
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
          action={
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-5"
                aria-label={`Technical details for ${tool.title || tool.name}`}
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
        <ResultDialogContent
          title={`${tool.title || tool.name}: Technical details`}
          description="Original tool arguments, result, and diagnostics."
        >
          {tool.input !== undefined ? <ToolInput input={(tool.input ?? {}) as never} /> : null}
          <ToolOutput errorText={tool.error as never} output={tool.output as never} />
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
