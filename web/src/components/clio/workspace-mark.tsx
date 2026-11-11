import {
  AtomIcon,
  BookOpenIcon,
  DatabaseIcon,
  FlaskConicalIcon,
  FolderGit2Icon,
  LeafIcon,
  MessageSquareIcon,
  ServerIcon,
  TelescopeIcon,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DEFAULT_WORKSPACE_ID } from '@/lib/workspace-labels';

const MARKS: readonly LucideIcon[] = [
  FlaskConicalIcon,
  BookOpenIcon,
  AtomIcon,
  ServerIcon,
  DatabaseIcon,
  TelescopeIcon,
  LeafIcon,
  FolderGit2Icon,
];

const TONES = ['text-chart-1', 'text-chart-2', 'text-chart-3', 'text-chart-4', 'text-chart-5'];

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

/**
 * A workspace's mark in the left bar: an icon and a chart color picked from
 * its id, so the same workspace always looks the same and neighbors differ.
 */
export function WorkspaceMark({ id, className }: { id: string; className?: string }) {
  const value = hash(id);
  const Icon = MARKS[value % MARKS.length]!;
  const tone = TONES[Math.floor(value / MARKS.length) % TONES.length]!;
  return <Icon aria-hidden="true" className={cn('size-4 shrink-0', tone, className)} />;
}

/** The top bar's crumb icon: a chat bubble for Conversations, otherwise the workspace's mark. */
export function WorkspaceCrumbMark({ id }: { id: string }) {
  return id === DEFAULT_WORKSPACE_ID ? (
    <MessageSquareIcon aria-hidden="true" className="size-4 shrink-0" />
  ) : (
    <WorkspaceMark id={id} />
  );
}
