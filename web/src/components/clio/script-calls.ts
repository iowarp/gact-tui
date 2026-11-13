import { childToolInvocations, type ToolInvocation } from '@clio/core/v3';
import { useContext } from 'react';
import { useLiveStore } from '@/store/live-store';
import { PresentationNavigation } from './presentation-navigation';
import { getToolActionLabel } from './tool-presentation';
import { imageReach, reachSummary } from './image-reach';

/** A background script's repeated calls to one tool, recorded once (`_clio_repeat`). */
export function repeatOf(
  tool: ToolInvocation,
): { count: number; first: string; last: string } | null {
  const input = tool.input;
  const repeat =
    input && typeof input === 'object' ? (input as Record<string, unknown>)._clio_repeat : null;
  if (!repeat || typeof repeat !== 'object') return null;
  const { count, first_at: first, last_at: last } = repeat as Record<string, unknown>;
  if (typeof count !== 'number' || count < 2) return null;
  return { count, first: String(first ?? ''), last: String(last ?? '') };
}

/**
 * What a script called, for its row: "View image ×4, shown to the model". Names
 * each tool in the order first called; whether images reached the model is said
 * once for the script.
 */
export function scriptCallsRecap(
  tools: Readonly<Record<string, ToolInvocation>>,
  parentId: string,
): { label: string; title: string } | undefined {
  const children = childToolInvocations(tools, parentId);
  if (!children.length) return undefined;
  const counts = new Map<string, number>();
  for (const tool of children) {
    const name = getToolActionLabel(tool);
    counts.set(name, (counts.get(name) ?? 0) + (repeatOf(tool)?.count ?? 1));
  }
  const names = [...counts].map(([name, count]) => (count > 1 ? `${name} ×${count}` : name));
  const reaches = children.map(imageReach).filter((item) => item !== undefined);
  const reach = reachSummary(reaches);
  const label = [names.join(', '), reach].filter(Boolean).join(', ');
  const details = [...new Set(reaches.map((item) => item.detail))];
  return { label, title: details.length ? [label, ...details].join('\n') : label };
}

/** A script row's recap from its calls, read without re-rendering for other tools' updates. */
export function useScriptCallsRecap(parentId: string | undefined) {
  const provided = useContext(PresentationNavigation)?.tools;
  const live = useLiveStore((state) =>
    parentId && !provided ? scriptCallsRecap(state.entities.tools, parentId)?.title : undefined,
  );
  const title = parentId
    ? provided
      ? scriptCallsRecap(provided, parentId)?.title
      : live
    : undefined;
  if (!title) return undefined;
  const [label, ...rest] = title.split('\n');
  return { label: label!, title: rest.length ? title : label! };
}
