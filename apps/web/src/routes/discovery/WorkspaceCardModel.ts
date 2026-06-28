/**
 * View-model / pure logic for Workspace Card: state shaping and helpers, no DOM. Key export `WorkspaceWithCreatedAt`.
 */
import type { Workspace } from '@clio/core';

export interface WorkspaceWithCreatedAt extends Workspace {
  created_at?: string;
}

export function workspaceCreatedAt(workspace: Workspace): string | null {
  return (workspace as WorkspaceWithCreatedAt).created_at ?? null;
}

export function humanWorkspaceDate(
  iso: string,
  locales?: Intl.LocalesArgument,
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(locales, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function workspaceRepoTokenLabel(tokens: number | undefined): string | null {
  return tokens ? `${tokens}t` : null;
}

export function workspaceRepoTreeText(tree: unknown): string {
  return JSON.stringify(tree, null, 2);
}
