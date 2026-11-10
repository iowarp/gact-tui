import { childToolInvocations, type ToolInvocation } from '@clio/core/v3';
import { useContext, useMemo, useState, type ReactNode } from 'react';
import { ActivityNest } from './activity-row';
import { useLiveStore } from '@/store/live-store';
import { PresentationNavigation } from './presentation-navigation';

/** How many of a script's calls show before "Show all". */
const SHOWN = 4;

/** A background script's repeated calls to one tool, recorded once (`_clio_repeat`). */
function repeatOf(tool: ToolInvocation): { count: number; first: string; last: string } | null {
  const input = tool.input;
  const repeat =
    input && typeof input === 'object' ? (input as Record<string, unknown>)._clio_repeat : null;
  if (!repeat || typeof repeat !== 'object') return null;
  const { count, first_at: first, last_at: last } = repeat as Record<string, unknown>;
  if (typeof count !== 'number' || count < 2) return null;
  return { count, first: String(first ?? ''), last: String(last ?? '') };
}

function clock(at: string): string {
  const date = new Date(at);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function useNestedCalls(parentId: string): ToolInvocation[] {
  // A conversation that carries its own calls (an offline export) supplies them; the live
  // view reads the store the stream fills.
  const provided = useContext(PresentationNavigation)?.tools;
  const live = useLiveStore((state) => state.entities.tools);
  const tools = provided ?? live;
  return useMemo(() => childToolInvocations(tools, parentId), [tools, parentId]);
}

/** A script's source, shown only while it has no calls of its own to show instead (spec: an opened script lists its calls). */
export function UnlessNestedCalls({
  parentId,
  children,
}: {
  parentId: string;
  children: ReactNode;
}) {
  return useNestedCalls(parentId).length ? null : children;
}

/**
 * The tool calls a run_code script made, nested under its row. Each child renders as
 * a compact tool row (`renderCall`), so it keeps its own status words, duration and
 * technical details; the heading counts the calls and the failures in words.
 */
export function NestedToolCalls({
  parentId,
  renderCall,
}: {
  parentId: string;
  renderCall: (tool: ToolInvocation) => ReactNode;
}) {
  const children = useNestedCalls(parentId);
  const [all, setAll] = useState(false);
  if (!children.length) return null;
  const failed = children.filter((tool) => tool.state === 'failed').length;
  const running = children.filter((tool) => ['pending', 'running'].includes(tool.state)).length;
  const shown = all ? children : children.slice(0, SHOWN);
  const calls = children.reduce((sum, tool) => sum + (repeatOf(tool)?.count ?? 1), 0);
  const count = `${calls} tool call${calls === 1 ? '' : 's'} from this script`;
  const detail = [failed ? `${failed} failed` : '', running ? `${running} running` : '']
    .filter(Boolean)
    .join(', ');
  return (
    <ActivityNest
      label={detail ? `${count} (${detail})` : count}
      hidden={all ? 0 : children.length - shown.length}
      onShowAll={() => setAll(true)}
      showAllLabel={`Show all ${children.length}`}
    >
      {shown.map((tool) => {
        const repeat = repeatOf(tool);
        const span = repeat
          ? [clock(repeat.first), clock(repeat.last)].filter(Boolean).join('–')
          : '';
        return (
          <div className="min-w-0" key={tool.id}>
            {renderCall(tool)}
            {repeat ? (
              <p className="pl-[30px] text-[11.5px] text-muted-foreground">
                {`Called ${repeat.count} times${span ? `, ${span}` : ''}`}
              </p>
            ) : null}
          </div>
        );
      })}
    </ActivityNest>
  );
}
