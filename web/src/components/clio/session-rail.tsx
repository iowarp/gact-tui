import { ChevronRightIcon } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ListGroupLabel } from '@/components/clio/primitives/list-row';
import { useEvidenceDisclosure } from '@/hooks/use-evidence-disclosures';
import { useSessionRailLayout } from '@/hooks/use-session-rail-layout';
import { cn } from '@/lib/utils';
import { SessionRailCustomize } from './session-rail-customize';
import {
  RAIL_GROUP_LABELS,
  railGroupSections,
  railSection,
  type RailGroup,
  type SessionRailItem,
  type SessionRailSectionId,
} from './session-rail-layout';

const ROW = '[data-rail-row]';

/** ↑ and ↓ walk the rail's rows (section names, runs, files) in reading order. */
function moveRailFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const target = event.target as HTMLElement;
  if (!target.matches(ROW)) return;
  // Closed sections unmount their content, so every row found is reachable.
  const rows = [...event.currentTarget.querySelectorAll<HTMLElement>(ROW)];
  const index = rows.indexOf(target);
  const next = rows[index + (event.key === 'ArrowDown' ? 1 : -1)];
  if (!next) return;
  event.preventDefault();
  next.focus();
}

/**
 * The conversation's inventory under one header: Context, then what is
 * happening now, then what this conversation holds. Each section is one row
 * that opens in place; its order and visibility are the person's.
 */
export function SessionRail({
  items,
  header,
}: {
  items: SessionRailItem[];
  /** Muted title and the rail's own controls; Customize joins them. */
  header?: (customize: ReactNode) => ReactNode;
}) {
  const { layout, save, reset } = useSessionRailLayout();
  const byId = new Map(items.map((item) => [item.id, item]));
  const shown = (id: SessionRailSectionId) =>
    !layout.hidden.includes(id) && (byId.has(id) || !layout.hideEmpty);
  const groups = (['context', 'now', 'conversation'] as const)
    .map((group) => ({ group, ids: railGroupSections(layout, group).filter(shown) }))
    .filter(({ ids }) => ids.length);
  const customize = <SessionRailCustomize layout={layout} onChange={save} onReset={reset} />;
  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex min-w-0 flex-col" data-slot="session-rail" onKeyDown={moveRailFocus}>
        {header ? header(customize) : <div className="flex justify-end px-1">{customize}</div>}
        <div className="px-1.5 pb-2">
          {groups.map(({ group, ids }) => (
            <RailGroupBlock key={group} group={group}>
              {ids.map((id) => (
                <RailSection key={id} id={id} item={byId.get(id)} />
              ))}
            </RailGroupBlock>
          ))}
          {!groups.length ? (
            <p className="px-2 py-4 text-xs text-muted-foreground">
              No sections to show. Add sections with Customize.
            </p>
          ) : null}
        </div>
      </div>
    </TooltipProvider>
  );
}

function RailGroupBlock({ group, children }: { group: RailGroup; children: ReactNode }) {
  if (group === 'context') return <div className="pb-1">{children}</div>;
  return (
    <div className="pt-2">
      <ListGroupLabel>{RAIL_GROUP_LABELS[group]}</ListGroupLabel>
      {children}
    </div>
  );
}

/** One section: a 28px row (chevron, icon, name, count) and its content under a guide line. */
function RailSection({ id, item }: { id: SessionRailSectionId; item?: SessionRailItem }) {
  const { label, icon: Icon, group } = railSection(id);
  const [open, setOpen] = useEvidenceDisclosure(
    `conversation-rail:${id}`,
    item?.defaultOpen ?? group === 'now',
  );
  const tally = item ? (item.summary ?? item.count?.toLocaleString()) : '0';
  return (
    <section role="region" tabIndex={-1} aria-label={`${label} section`} className="min-w-0">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            data-rail-row=""
            aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`}
            className="flex h-7 w-full min-w-0 items-center gap-1.5 rounded-[5px] px-1 text-left text-[13px] hover:bg-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <ChevronRightIcon
              aria-hidden="true"
              className={cn(
                'size-3 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none',
                open && 'rotate-90',
              )}
            />
            <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-semibold">{label}</span>
            {tally === undefined ? null : (
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{tally}</span>
            )}
          </button>
        </CollapsibleTrigger>
        {item?.below ? <div className="pl-[26px] pr-1 pb-1">{item.below}</div> : null}
        <CollapsibleContent className="ml-[13px] min-w-0 border-l border-border/70 pb-1.5 pl-3 text-xs">
          {item ? item.content : <p className="py-1 text-muted-foreground">Nothing yet.</p>}
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
