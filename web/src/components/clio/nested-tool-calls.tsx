import { childToolInvocations, type ToolInvocation } from '@clio/core/v3';
import { useContext, useMemo, useState, type ReactNode } from 'react';
import { ActivityNest } from './activity-row';
import { useLiveStore } from '@/store/live-store';
import { PresentationNavigation } from './presentation-navigation';
import { repeatOf } from './script-calls';
import { formatLocale } from '@/lib/locale-format';
import { plural, t } from '@lingui/core/macro';

/** How many of a script's calls show before "Show all". */
const SHOWN = 4;

function clock(at: string): string {
  const date = new Date(at);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString(formatLocale(), {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
}

function useNestedCalls(parentId: string): ToolInvocation[] {
  // A conversation that carries its own calls (an offline export) supplies them; the live
  // view reads the store the stream fills.
  const provided = useContext(PresentationNavigation)?.tools;
  const live = useLiveStore((state) => state.entities.tools);
  const tools = provided ?? live;
  return useMemo(() => childToolInvocations(tools, parentId), [tools, parentId]);
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
  const count = plural(calls, {
    one: '# call from this script',
    other: '# calls from this script',
  });
  const detail = [failed ? t`${failed} failed` : '', running ? t`${running} running` : '']
    .filter(Boolean)
    .join(', ');
  return (
    <ActivityNest
      label={detail ? t`${count} (${detail})` : count}
      heading={detail ? t`${count}, ${detail}` : count}
      hidden={all ? 0 : children.length - shown.length}
      onShowAll={() => setAll(true)}
      showAllLabel={t`Show all ${calls}`}
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
              <p className="pl-[30px] text-label text-muted-foreground">
                {span
                  ? plural(repeat.count, {
                      one: `Called # time, ${span}`,
                      other: `Called # times, ${span}`,
                    })
                  : plural(repeat.count, { one: 'Called # time', other: 'Called # times' })}
              </p>
            ) : null}
          </div>
        );
      })}
    </ActivityNest>
  );
}
