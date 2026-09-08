import type { ToolInvocation } from '@clio/core/v3';
import { WrenchIcon } from 'lucide-react';
import { ToolInput, ToolOutput } from '@/components/ai-elements/tool';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ActivityRow } from './activity-row';
import { ToolResultPresentation } from './tool-result-presentation';

export function ClioToolInvocation({ tool, defaultOpen }: {
  tool?: ToolInvocation; defaultOpen?: boolean; embedded?: boolean;
}) {
  if (!tool) return <p className="text-sm text-muted-foreground">Tool details unavailable</p>;
  return <div className="flex min-w-0 flex-col gap-1" data-slot="tool-activity">
    <ActivityRow icon={<WrenchIcon className="size-4" />} title={tool.title || tool.name} detail={tool.presentation?.summary} status={tool.state} duration={tool.duration_ms} />
    <ToolResultPresentation tool={tool} />
    <Collapsible className="ml-7" defaultOpen={defaultOpen ?? false}>
      <CollapsibleTrigger className="text-sm text-muted-foreground underline">Technical details</CollapsibleTrigger>
      <CollapsibleContent className="flex min-w-0 flex-col gap-2 py-2">
        {tool.input !== undefined ? <ToolInput input={(tool.input ?? {}) as never} /> : null}
        <ToolOutput errorText={tool.error as never} output={tool.output as never} />
        {tool.presentation?.diagnostic ? <p>{tool.presentation.diagnostic}</p> : null}
      </CollapsibleContent>
    </Collapsible>
  </div>;
}
