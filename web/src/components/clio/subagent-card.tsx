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
          task: compactText(assignment.label, 260, false),
          state: toTheoState(subagent.state),
          duration: formatDuration(subagent.duration_ms),
          result: subagent.result ? compactResult(subagent.result, 300) : undefined,
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

function compactText(value: string, limit: number, preferLastParagraph: boolean): string {
  const paragraphs = value
    .split(/\n\s*\n/u)
    .map((item) => item.trim())
    .filter(Boolean);
  const selected = preferLastParagraph ? (paragraphs.at(-1) ?? value) : (paragraphs[0] ?? value);
  return selected.length > limit ? `${selected.slice(0, limit - 1).trimEnd()}…` : selected;
}

function compactResult(value: string, limit: number): string {
  const paragraphs = value
    .split(/\n\s*\n/u)
    .map((item) => item.trim())
    .filter(Boolean);
  const selected =
    paragraphs
      .map((paragraph, index) => ({ paragraph, index, score: resultParagraphScore(paragraph) }))
      .sort((left, right) => right.score - left.score || right.index - left.index)[0]?.paragraph ??
    value;
  const plain = selected
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1')
    .replace(/(?:\*\*|__)(.*?)(?:\*\*|__)/gu, '$1')
    .replace(/`([^`]+)`/gu, '$1')
    .replace(/^#{1,6}\s+/gmu, '');
  return plain.length > limit ? `${plain.slice(0, limit - 1).trimEnd()}…` : plain;
}

function resultParagraphScore(value: string): number {
  let score = 0;
  if (/\b(?:found|resolved|created|generated|completed?|result)\b/iu.test(value)) score += 3;
  if (/\b(?:candidate|station|record|row|file|artifact)s?\b/iu.test(value)) score += 2;
  if (
    /\b(?:within_radius_count\s*=\s*)?\d[\d,.]*\s+(?:candidate\s+)?(?:GNSS\s+)?stations?\b/iu.test(
      value,
    )
  ) {
    score += 8;
  }
  if (/\b(?:starting|now phase|next step|i(?:'|’)ll|will submit)\b/iu.test(value)) score -= 4;
  if (/\bno (?:station )?time-series CSV was staged\b/iu.test(value)) score -= 3;
  return score;
}

function formatDuration(milliseconds?: number): string | undefined {
  if (milliseconds === undefined) return undefined;
  if (milliseconds < 1_000) return `${Math.round(milliseconds)} ms`;
  if (milliseconds < 60_000) return `${Math.round(milliseconds / 1_000)} s`;
  return `${Math.floor(milliseconds / 60_000)}m ${Math.round((milliseconds % 60_000) / 1_000)}s`;
}
