import type { SubagentRun } from '@clio/core/v3';
import { ArrowRightIcon, PanelRightOpenIcon } from 'lucide-react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { SubAgentDispatch, type SubAgentState } from '@/components/theokit/sub-agent-dispatch';

export interface ClioSubagentCardProps {
  subagent?: SubagentRun;
  onOpen?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
}

export type SubagentOpenTarget = 'conversation' | 'canvas';

export function ClioSubagentCard({ subagent, onOpen }: ClioSubagentCardProps) {
  if (!subagent) {
    return (
      <SubAgentDispatch
        run={{
          id: 'unavailable',
          agent: 'Child agent unavailable',
          task: 'The server did not provide this child-agent record.',
          state: 'failed',
        }}
      />
    );
  }

  const openFromPointer = (event: MouseEvent<HTMLElement>) => {
    onOpen?.(subagent, event.shiftKey ? 'canvas' : 'conversation');
  };
  const openFromKeyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onOpen?.(subagent, event.shiftKey ? 'canvas' : 'conversation');
  };

  return (
    <div className="grid gap-2">
      <SubAgentDispatch
        aria-label={`Open child conversation ${subagent.title}`}
        className={
          subagent.child_session_id && onOpen
            ? 'cursor-pointer outline-none transition-colors hover:border-primary/60 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring/50'
            : undefined
        }
        onClick={subagent.child_session_id && onOpen ? openFromPointer : undefined}
        onKeyDown={subagent.child_session_id && onOpen ? openFromKeyboard : undefined}
        onMouseDown={
          subagent.child_session_id && onOpen
            ? (event) => {
                if (event.shiftKey) event.preventDefault();
              }
            : undefined
        }
        role={subagent.child_session_id && onOpen ? 'button' : undefined}
        run={{
          id: subagent.id,
          agent: subagent.title,
          task: compactText(
            subagent.task || subagent.summary || 'Working on a delegated part of this task.',
            420,
            false,
          ),
          state: toTheoState(subagent.state),
          duration: formatDuration(subagent.duration_ms),
          lastEvent: subagent.child_session_id ? 'Child conversation available' : undefined,
          result: subagent.result ? compactText(subagent.result, 420, true) : undefined,
        }}
        tabIndex={subagent.child_session_id && onOpen ? 0 : undefined}
        title={
          subagent.child_session_id && onOpen
            ? 'Open child conversation. Shift-click to open it in the canvas.'
            : undefined
        }
      />
      {subagent.child_session_id && onOpen ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            className="justify-between"
            onClick={(event) => onOpen(subagent, event.shiftKey ? 'canvas' : 'conversation')}
            size="sm"
            variant="outline"
          >
            Open conversation
            <ArrowRightIcon aria-hidden="true" className="size-3.5" />
          </Button>
          <Button
            className="justify-between"
            onClick={() => onOpen(subagent, 'canvas')}
            size="sm"
            variant="ghost"
          >
            Open in canvas
            <PanelRightOpenIcon aria-hidden="true" className="size-3.5" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function toTheoState(state: SubagentRun['state']): SubAgentState {
  if (state === 'queued') return 'spawning';
  if (state === 'running' || state === 'waiting_permission' || state === 'waiting_user') {
    return 'running';
  }
  if (state === 'failed' || state === 'interrupted') return 'failed';
  if (state === 'cancelled') return 'cancelled';
  return 'completed';
}

function compactText(value: string, limit: number, preferLastParagraph: boolean): string {
  const paragraphs = value
    .split(/\n\s*\n/u)
    .map((item) => item.trim())
    .filter(Boolean);
  const selected = preferLastParagraph ? (paragraphs.at(-1) ?? value) : (paragraphs[0] ?? value);
  return selected.length > limit ? `${selected.slice(0, limit - 1).trimEnd()}…` : selected;
}

function formatDuration(milliseconds?: number): string | undefined {
  if (milliseconds === undefined) return undefined;
  if (milliseconds < 1_000) return `${Math.round(milliseconds)} ms`;
  if (milliseconds < 60_000) return `${Math.round(milliseconds / 1_000)} s`;
  return `${Math.floor(milliseconds / 60_000)}m ${Math.round((milliseconds % 60_000) / 1_000)}s`;
}
