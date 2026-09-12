import type { ToolInvocation } from '@clio/core/v3';
import { InfoIcon, WrenchIcon } from 'lucide-react';
import { ToolInput, ToolOutput } from '@/components/ai-elements/tool';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { ActivityRow } from './activity-row';
import { ToolResultPresentation } from './tool-result-presentation';
import { ResultDialogContent } from './result-dialog-content';
import { PresentationLink } from './presentation-link';
import { getToolHeaderMetadata, getToolStatus } from './tool-presentation';
import { withWorkflowPresentation } from './workflow-tool-presentation';

export function ClioToolInvocation({
  tool,
  defaultOpen,
}: {
  tool?: ToolInvocation;
  defaultOpen?: boolean;
  embedded?: boolean;
}) {
  if (!tool) return <p className="text-sm text-muted-foreground">Tool details unavailable</p>;
  const presentedTool = withWorkflowPresentation(withSkillFileSubject(tool));
  const subject = presentedTool.presentation?.blocks.find(
    (block) =>
      block.id === presentedTool.presentation?.subject &&
      (block.type === 'link' || block.type === 'text'),
  );
  const status = getToolStatus(presentedTool);
  const headerMetadata = getToolHeaderMetadata(presentedTool);
  return (
    <Dialog defaultOpen={defaultOpen ?? false}>
      <div
        className="flex min-w-0 scroll-m-6 flex-col gap-0.5 rounded-sm focus:outline-2 focus:outline-offset-2 focus:outline-primary"
        data-slot="tool-activity"
        id={`tool-${tool.id}`}
        tabIndex={-1}
      >
        <ActivityRow
          icon={<WrenchIcon className="size-4" />}
          title={
            <span className="flex w-full min-w-0 items-center gap-1" data-slot="tool-action-label">
              <span className="shrink-0">
                {presentedTool.presentation?.action || tool.title || tool.name}
              </span>
              {subject ? (
                <>
                  <span aria-hidden="true">(</span>
                  <PresentationLink block={subject} compact />
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
          summaryInHeader={Boolean(headerMetadata)}
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
