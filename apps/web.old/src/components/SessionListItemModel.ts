/**
 * View-model / pure logic for Session List Item: state shaping and helpers, no DOM. Key export `isFreshBump`.
 */
import type { SessionStatus } from '@clio/core';

export function isFreshBump(bumpedAt: number | undefined, now = Date.now()): boolean {
  if (typeof bumpedAt !== 'number') return false;
  return now - bumpedAt < 2000;
}

export function sessionStatusPipClass(status: SessionStatus): string {
  switch (status) {
    case 'running':
      return 'running';
    case 'waiting_permission':
      return 'waiting';
    case 'error':
      return 'error';
    case 'finished':
      return 'finished';
    default:
      return 'idle';
  }
}

export function normalizedSessionTitle(title: string): string {
  return title.trim() || 'Untitled session';
}

export function shouldCommitRename(draft: string, currentTitle: string): string | null {
  const nextTitle = draft.trim();
  if (!nextTitle || nextTitle === currentTitle) return null;
  return nextTitle;
}
