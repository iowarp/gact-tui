import type { ToolInvocation, VariantStepPart, VariantTryStep } from '@clio/core/v3';
import { FileIcon, ListTreeIcon } from 'lucide-react';
import { Fragment } from 'react';
import { MessageResponse } from '@/components/ai-elements/message';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { humanizeProtocolValue } from './presentation-labels';
import { ClioToolInvocation } from './tool-invocation';

type ToolResultPart = Extract<VariantStepPart, { type: 'tool_result' }>;

/** A result's readable content: its text parts, media named by type. */
function resultText(parts: readonly VariantStepPart[]): string {
  return parts
    .map((part) =>
      part.type === 'text' || part.type === 'thinking'
        ? part.text
        : part.type === 'image' || part.type === 'document'
          ? `[${part.type}: ${part.media_type}]`
          : part.type === 'unknown'
            ? `[${humanizeProtocolValue(part.original_type)}]`
            : '',
    )
    .filter(Boolean)
    .join('\n');
}

/** A recorded call and its result as the conversation's own tool row. */
function recordedTool(
  call: Extract<VariantStepPart, { type: 'tool_call' }>,
  result: ToolResultPart | undefined,
  sessionId: string,
): ToolInvocation {
  return {
    id: call.id,
    session_id: sessionId,
    name: call.name,
    state: result === undefined ? 'cancelled' : result.is_error ? 'failed' : 'succeeded',
    input: call.input,
    ...(result
      ? result.is_error
        ? { error: resultText(result.content) }
        : { output: resultText(result.content) }
      : {}),
  };
}

function StepPart({
  part,
  results,
  sessionId,
}: {
  part: VariantStepPart;
  results: ReadonlyMap<string, ToolResultPart>;
  sessionId: string;
}) {
  switch (part.type) {
    case 'thinking':
      return (
        <Reasoning className="mb-0" defaultOpen={false}>
          <ReasoningTrigger className="min-h-6" />
          <ReasoningContent className="mt-1 leading-5">{part.text}</ReasoningContent>
        </Reasoning>
      );
    case 'text':
      return (
        <div className="min-w-0 text-sm">
          <MessageResponse>{part.text}</MessageResponse>
        </div>
      );
    case 'tool_call':
      return <ClioToolInvocation tool={recordedTool(part, results.get(part.id), sessionId)} />;
    case 'image':
    case 'document':
      return (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileIcon aria-hidden="true" className="size-3.5" />
          {part.type === 'image' ? 'Image' : 'Document'} ({part.media_type})
        </p>
      );
    case 'tool_result':
      // Shown with its call; a result with no recorded call stands alone.
      return results.has(part.id) ? null : (
        <pre className="whitespace-pre-wrap break-words rounded-md bg-muted p-2 text-xs">
          {resultText(part.content)}
        </pre>
      );
    case 'unknown':
      return (
        <p className="text-xs text-muted-foreground">
          A {humanizeProtocolValue(part.original_type)} step part this version cannot display.
        </p>
      );
  }
}

/**
 * A try's own recorded line, read-only: what it was given, its thinking and
 * text, its tool calls with their results -- rendered like the conversation.
 */
export function VariantTrySteps({
  steps,
  sessionId,
  advice,
}: {
  steps: readonly VariantTryStep[];
  sessionId: string;
  /** Already shown as the tab's injection; not repeated here. */
  advice?: string;
}) {
  if (steps.length === 0) return null;
  const results = new Map<string, ToolResultPart>();
  const calls = new Set<string>();
  for (const step of steps) {
    for (const part of step.parts) {
      if (part.type === 'tool_result') results.set(part.id, part);
      if (part.type === 'tool_call') calls.add(part.id);
    }
  }
  const paired = new Map([...results].filter(([id]) => calls.has(id)));
  const shown = steps
    .map((step) => ({
      role: step.role,
      parts: step.parts.filter(
        (part) =>
          !(
            step.role === 'user' &&
            part.type === 'text' &&
            advice &&
            part.text.trim() === advice.trim()
          ),
      ),
    }))
    .filter((step) => step.parts.length > 0);
  if (shown.length === 0) return null;
  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ListTreeIcon aria-hidden="true" className="size-3.5" />
        {shown.length === 1 ? '1 recorded step' : `${shown.length} recorded steps`}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol className="mt-2 space-y-2 border-l pl-3" data-slot="variant-try-steps">
          {shown.map((step, index) => (
            <li className="flex min-w-0 flex-col gap-1.5" key={`${step.role}:${index}`}>
              {step.role === 'user' ? (
                <p className="text-xs font-medium text-muted-foreground">Given to this try</p>
              ) : null}
              {step.parts.map((part, partIndex) => (
                <Fragment key={partIndex}>
                  <StepPart part={part} results={paired} sessionId={sessionId} />
                </Fragment>
              ))}
            </li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}
