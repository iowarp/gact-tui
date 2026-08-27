import type { SubagentRun } from '@clio/core/v3';
import type { KeyboardEvent, MouseEvent } from 'react';
import { SubAgentDispatch, type SubAgentState } from '@/components/theokit/sub-agent-dispatch';
import { getChildAgentAssignment } from './child-agent-presentation';

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
          id: 'connecting',
          agent: 'Connecting child agent',
          task: 'Waiting for the live child record.',
          state: 'spawning',
        }}
      />
    );
  }

  const assignment = getChildAgentAssignment(subagent);

  const openFromPointer = (event: MouseEvent<HTMLElement>) => {
    onOpen?.(subagent, event.shiftKey ? 'canvas' : 'conversation');
  };
  const openFromKeyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onOpen?.(subagent, event.shiftKey ? 'canvas' : 'conversation');
  };

  return (
    <div title={assignment.detail}>
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
          task: compactText(assignment.label, 260),
          state: toTheoState(subagent.state),
          duration: formatDuration(subagent.duration_ms),
          result: subagent.result ? compactText(subagent.result, 300) : undefined,
        }}
        tabIndex={subagent.child_session_id && onOpen ? 0 : undefined}
        title={
          subagent.child_session_id && onOpen
            ? 'Open child conversation. Shift-click to open it in the canvas.'
            : undefined
        }
      />
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

function compactText(value: string, limit: number): string {
  const normalized = value.replace(/\s+/gu, ' ').trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 1).trimEnd()}…` : normalized;
}

function formatDuration(milliseconds?: number): string | undefined {
  if (milliseconds === undefined) return undefined;
  if (milliseconds < 1_000) return `${Math.round(milliseconds)} ms`;
  if (milliseconds < 60_000) return `${Math.round(milliseconds / 1_000)} s`;
  return `${Math.floor(milliseconds / 60_000)}m ${Math.round((milliseconds % 60_000) / 1_000)}s`;
}
