import type { ToolInvocation } from '@clio/core/v3';
import { InfoIcon, WrenchIcon } from 'lucide-react';
import { ToolInput, ToolOutput } from '@/components/ai-elements/tool';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { ActivityRow } from './activity-row';
import { ToolResultPresentation } from './tool-result-presentation';
import { ResultDialogContent } from './result-dialog-content';
import { PresentationLink } from './presentation-link';
import type { ClioStatusValue } from './status';

const PRESENTATION_STATUSES = new Set<ClioStatusValue>([
  'succeeded',
  'failed',
  'degraded',
  'cancelled',
  'denied',
]);

export function ClioToolInvocation({
  tool,
  defaultOpen,
}: {
  tool?: ToolInvocation;
  defaultOpen?: boolean;
  embedded?: boolean;
}) {
  if (!tool) return <p className="text-sm text-muted-foreground">Tool details unavailable</p>;
  const subject = tool.presentation?.blocks.find(
    (block) =>
      block.id === tool.presentation?.subject && (block.type === 'link' || block.type === 'text'),
  );
  const declaredStatus = tool.presentation?.status;
  const status =
    declaredStatus && PRESENTATION_STATUSES.has(declaredStatus as ClioStatusValue)
      ? (declaredStatus as ClioStatusValue)
      : tool.state;
  return (
    <Dialog defaultOpen={defaultOpen ?? false}>
      <div className="flex min-w-0 flex-col gap-0.5" data-slot="tool-activity">
        <ActivityRow
          icon={<WrenchIcon className="size-4" />}
          title={
            <span className="flex min-w-0 items-center gap-1" data-slot="tool-action-label">
              <span className="shrink-0">
                {tool.presentation?.action || tool.title || tool.name}
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
          detail={tool.presentation?.summary}
          inlineDetail
          status={status}
          duration={tool.duration_ms}
          action={
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-6"
                aria-label={`Technical details for ${tool.title || tool.name}`}
                title="Technical details"
              >
                <InfoIcon className="size-4" />
              </Button>
            </DialogTrigger>
          }
        />
        <ToolResultPresentation tool={tool} subjectId={subject?.id} />
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
