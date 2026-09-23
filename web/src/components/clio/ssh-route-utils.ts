import { arrayMove } from '@dnd-kit/sortable';

export function jumpRouteId(index: number): string {
  return `ssh-jump-${index}`;
}

/** Reorder an SSH jump chain from stable drag identifiers. */
export function reorderJumpHosts(jumps: string[], activeId: string, overId: string): string[] {
  const from = jumps.findIndex((_, index) => jumpRouteId(index) === activeId);
  const to = jumps.findIndex((_, index) => jumpRouteId(index) === overId);
  return from >= 0 && to >= 0 && from !== to ? arrayMove(jumps, from, to) : jumps;
}
