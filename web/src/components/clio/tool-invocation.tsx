import type { ToolInvocation } from '@clio/core/v3';
import { InfoIcon, WrenchIcon } from 'lucide-react';
import { ToolInput, ToolOutput } from '@/components/ai-elements/tool';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { ActivityRow } from './activity-row';
import { ToolResultPresentation } from './tool-result-presentation';
import { ResultDialogContent } from './result-dialog-content';

export function ClioToolInvocation({
  tool,
  defaultOpen,
}: {
  tool?: ToolInvocation;
  defaultOpen?: boolean;
  embedded?: boolean;
}) {
  if (!tool) return <p className="text-sm text-muted-foreground">Tool details unavailable</p>;
  return (
    <Dialog defaultOpen={defaultOpen ?? false}>
      <div className="flex min-w-0 flex-col gap-1" data-slot="tool-activity">
        <ActivityRow
          icon={<WrenchIcon className="size-4" />}
          title={tool.title || tool.name}
          detail={tool.presentation?.summary}
          status={tool.state}
          duration={tool.duration_ms}
          action={
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Technical details for ${tool.title || tool.name}`}
                title="Technical details"
              >
                <InfoIcon className="size-4" />
              </Button>
            </DialogTrigger>
          }
        />
        <ToolResultPresentation tool={tool} />
        <ResultDialogContent
          title={`${tool.title || tool.name} — Technical details`}
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
