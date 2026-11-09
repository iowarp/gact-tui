import type { AttentionBlock, ToolInvocation, ToolPresentationBlock } from '@clio/core/v3';
import { useContext, type ReactNode } from 'react';
import { InfoIcon } from '@/lib/icon-vocabulary';
import { ToolInput, ToolOutput } from '@/components/ai-elements/tool';
import { Button } from '@/components/ui/button';
import { formatDuration } from '@/lib/format';
import { useLiveStore } from '@/store/live-store';
import { DialogFrame } from './primitives/dialog-frame';
import { KeyValueGrid, type KeyValueItem } from './primitives/key-value-grid';
import { PresentationLink } from './presentation-link';
import { PresentationNavigation } from './presentation-navigation';
import { PagedBlock } from './tool-result-primitives';
import { ToolAttentionField } from './tool-attention-fields';
import { getToolActionLabel } from './tool-presentation';
import type { SandboxBoundary } from './sandbox-boundary';

function clock(at: string | undefined): string | undefined {
  if (!at) return undefined;
  const date = new Date(at);
  return Number.isNaN(date.getTime())
    ? undefined
    : date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * ⓘ on an activity row: the call's facts on one grid (tool, caller, timing,
 * sandbox), then its arguments, result or error, diagnostics and the
 * submission response, in the shared dialog frame.
 */
export function ToolTechnicalDetailsDialog({
  open,
  onOpenChange,
  tool,
  title,
  duration,
  active,
  boundary,
  link,
  catalogContent,
  attentionFields,
  sessionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tool: ToolInvocation;
  title: string;
  duration?: number;
  active: boolean;
  boundary?: SandboxBoundary;
  /** A compact row's subject or flow, reachable from the dialog. */
  link?: ReactNode;
  catalogContent: readonly ToolPresentationBlock[];
  attentionFields?: readonly AttentionBlock[];
  sessionId?: string;
}) {
  const provided = useContext(PresentationNavigation)?.tools;
  const parent = useLiveStore((state) =>
    tool.parent_call_id
      ? (provided?.[tool.parent_call_id] ?? state.entities.tools[tool.parent_call_id])
      : undefined,
  );
  const started = clock(tool.started_at);
  const items: KeyValueItem[] = [
    { label: 'Tool', value: tool.name, mono: true },
    ...(parent
      ? [{ label: 'Called by', value: getToolActionLabel(parent), title: parent.name }]
      : []),
    ...(duration !== undefined
      ? [
          {
            label: active ? 'Elapsed time' : 'Execution time',
            // The same reading as the row's elapsed column, so 820 ms reads 0.8s in both.
            value: `${formatDuration(duration, 'elapsed')}${started ? `, started ${started}` : ''}`,
          },
        ]
      : []),
    ...(boundary
      ? [
          {
            label: 'Sandbox',
            value: boundary.request_roots.length
              ? `On, blocked ${boundary.kind === 'write_denied' ? 'a write to' : 'access to'} ${boundary.request_roots.join(', ')}`
              : boundary.message,
            title: boundary.message,
          },
        ]
      : []),
  ];
  const attentionInput = attentionFields?.filter((entry) => entry.kind === 'tool_input') ?? [];
  const attentionResult = attentionFields?.filter((entry) => entry.kind === 'tool_result') ?? [];
  return (
    <DialogFrame
      open={open}
      onOpenChange={onOpenChange}
      icon={<InfoIcon className="size-4" />}
      title={title}
      description="Original tool arguments, result, and diagnostics."
      className="w-[clamp(360px,56vw,760px)]"
    >
      <div
        role="region"
        aria-label="Scrollable result content"
        tabIndex={0}
        className="-mr-3 grid max-h-[65dvh] min-w-0 grid-cols-1 gap-4 overflow-auto overscroll-contain pr-3 pb-2 text-[12.5px] [overflow-wrap:anywhere]"
        data-slot="tool-technical-details"
      >
        <KeyValueGrid
          items={items}
          className="grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-y-1.5 text-[12.5px] [&_dd]:text-left"
        />
        {link}
        {catalogContent.length ? (
          <section aria-label="Loaded widget catalog" className="min-w-0 space-y-2">
            <h4 className="text-[12.5px] font-medium text-foreground">Loaded content</h4>
            <PagedBlock
              block={catalogContent[0]}
              groupedBlocks={[...catalogContent]}
              lines={20}
              full
            />
          </section>
        ) : null}
        {attentionInput.length ? (
          attentionInput.map((block) => (
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
        {attentionResult.length ? (
          attentionResult.map((block) => (
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
        {attentionResult.length && tool.error ? <p role="alert">{String(tool.error)}</p> : null}
        {tool.execution_task && attentionResult.length ? (
          <section aria-label="Execution result">
            <p>Execution result</p>
            <ToolOutput output={tool.output as never} errorText={tool.error} />
          </section>
        ) : null}
        {tool.presentation?.diagnostic ? (
          <p className="text-muted-foreground">{tool.presentation.diagnostic}</p>
        ) : null}
        {tool.submission ? (
          <details className="group/submission">
            <summary className="cursor-pointer text-[12px] text-muted-foreground hover:text-foreground">
              Submission response
            </summary>
            <div className="mt-2">
              <ToolOutput
                output={tool.submission.output as never}
                errorText={tool.submission.error}
              />
            </div>
          </details>
        ) : null}
      </div>
    </DialogFrame>
  );
}

/** A compact row's way to its subject or flow from inside the dialog. */
export function TechnicalDetailsLink({
  onOpenFlow,
  flowLabel,
  subject,
  onClose,
}: {
  onOpenFlow?: () => void;
  flowLabel?: string;
  subject?: ToolPresentationBlock;
  onClose: () => void;
}) {
  if (onOpenFlow)
    return (
      <Button
        variant="link"
        className="h-auto justify-start p-0"
        onClick={() => {
          onClose();
          onOpenFlow();
        }}
      >
        Open {(flowLabel ?? 'flow').toLowerCase()} run
      </Button>
    );
  return subject ? <PresentationLink block={subject} /> : null;
}
