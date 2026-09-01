import type { ToolInvocation } from '@clio/core/v3';
import { ChevronDownIcon, PanelsTopLeftIcon, WrenchIcon } from 'lucide-react';
import { ClioStatus } from './status';
import { Tool, ToolContent, ToolInput, ToolOutput } from '@/components/ai-elements/tool';
import { CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatToolDuration, getToolPresentation, getToolSummary } from './tool-presentation';
import { cn } from '@/lib/utils';

export function ClioToolInvocation({
  tool,
  defaultOpen,
  embedded = false,
}: {
  tool?: ToolInvocation;
  defaultOpen?: boolean;
  embedded?: boolean;
}) {
  if (!tool) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <ClioStatus value="unavailable" label="Tool details unavailable" />
      </div>
    );
  }
  const presentation = getToolPresentation(tool);
  const summary = getToolSummary(tool);
  const PresentationIcon = presentation.kind === 'analysis-view' ? PanelsTopLeftIcon : WrenchIcon;
  return (
    <Tool
      className={cn(
        'overflow-hidden rounded-xl bg-card/70',
        embedded && 'mb-0 rounded-none border-0 bg-transparent',
      )}
      defaultOpen={defaultOpen}
    >
      <CollapsibleTrigger
        className={cn(
          'group flex w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          embedded && 'px-0 py-0 hover:bg-transparent',
        )}
      >
        {!embedded ? (
          <PresentationIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{presentation.title}</span>
          {summary ? (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{summary}</span>
          ) : null}
        </span>
        <ClioStatus value={tool.state} />
        {tool.duration_ms !== undefined ? (
          <span className="font-mono text-xs text-muted-foreground">
            {formatToolDuration(tool.duration_ms)}
          </span>
        ) : null}
        <ChevronDownIcon
          aria-hidden="true"
          className="size-4 transition-transform group-data-[state=open]:rotate-180"
        />
      </CollapsibleTrigger>
      <ToolContent className={cn('border-t', embedded && 'mt-2 rounded-lg border p-3')}>
        {tool.input !== undefined ? <ToolInput input={tool.input as never} /> : null}
        <ToolOutput errorText={tool.error as never} output={tool.output as never} />
      </ToolContent>
    </Tool>
  );
}
