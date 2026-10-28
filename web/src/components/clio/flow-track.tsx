import type { FlowRunUsage } from '@clio/core/v3';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { FlowPresentation } from '@/hooks/use-flow-presentation';
import { FlowDiagram } from './flow-diagram';
import type { FlowQuestion } from './flow-run-edits';
import type { FlowPick } from './flow-railroad';
import { FlowLegend, FlowPickDetails } from './flow-run-parts';

/**
 * A run's diagram with what it means and what it holds: the legend of the
 * states it shows, and the details of the node the person selects (selecting
 * it again, or Close, clears it). A workflow drawn as a graph, or a flow without
 * a diagram, lists its steps as buttons to select instead.
 */
export function FlowTrack({
  flow,
  presentation,
  onOpenHandle,
  fontSize,
  scale,
  className,
  usage,
  historyUnavailable,
  questions,
  active = true,
}: {
  /** The approval questions the run asked, shown on the step each is about. */
  questions?: readonly FlowQuestion[];
  flow: string;
  presentation: FlowPresentation;
  /** The run's usage, for the model each selected call's child runs on. */
  usage?: FlowRunUsage;
  onOpenHandle: (handle: string) => void;
  fontSize?: number;
  scale?: number;
  className?: string;
  /** The run stopped without recording task history; do not imply it started none. */
  historyUnavailable?: boolean;
  active?: boolean;
}) {
  const [selected, setSelected] = useState<string>();
  const { diagram, steps, members, elapsed } = presentation;
  const railroad = diagram?.kind === 'railroad' ? diagram.railroad : undefined;
  const picks = new Map<string, { name: string; pick: FlowPick }>(
    railroad
      ? [...railroad.marks, ...railroad.boxes.map((box) => box.mark)].map((mark) => [
          mark.key,
          { name: mark.key, pick: mark.pick },
        ])
      : [
          ...steps.map(
            (step) =>
              [step.id, { name: step.label ?? step.id, pick: { kind: 'step', step } }] as const,
          ),
          ...members.map(
            (member) =>
              [member.key, { name: member.label, pick: { kind: 'member', member } }] as const,
          ),
        ],
  );
  const pick = selected ? picks.get(selected)?.pick : undefined;
  const select = (key: string) => setSelected(key === selected ? undefined : key);
  const noun = steps.length || flow === 'workflow' ? 'step' : flow === 'arena' ? 'entry' : 'member';
  return (
    <div className="grid min-w-0 gap-2">
      {diagram ? (
        <FlowDiagram
          active={active}
          className={className}
          fontSize={fontSize}
          onSelect={select}
          scale={scale}
          selected={selected}
          spec={diagram}
        />
      ) : null}
      {railroad ? (
        <FlowLegend
          hint={pick ? undefined : `Select a ${noun} to see it`}
          tones={[...new Set(railroad.marks.map((mark) => mark.tone))]}
        />
      ) : picks.size ? (
        <div aria-label={`Select a ${noun}`} className="flex flex-wrap gap-1" role="group">
          {[...picks].map(([key, entry]) => (
            <Button
              aria-pressed={key === selected}
              className="h-6 px-2 text-xs"
              key={key}
              onClick={() => select(key)}
              size="xs"
              variant={key === selected ? 'secondary' : 'outline'}
            >
              {entry.name}
            </Button>
          ))}
        </div>
      ) : (
        <p
          className="text-xs text-muted-foreground"
          role={historyUnavailable ? 'status' : undefined}
        >
          {historyUnavailable
            ? 'Task history was not recorded for this stopped flow. Whether it started any tasks is unknown.'
            : 'The flow has not started any task yet.'}
        </p>
      )}
      {pick ? (
        <FlowPickDetails
          elapsed={elapsed}
          flows={presentation.flows}
          onClose={() => setSelected(undefined)}
          onOpenHandle={onOpenHandle}
          pick={pick}
          questions={questions}
          usage={usage}
        />
      ) : null}
    </div>
  );
}
