import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { sessionSectionHeights, untransformedBorderBoxHeight } from './session-section-layout';

/** Anchor docked sections independently; keep popup sections together in one scrollable view. */
export function SessionEvidenceColumn({
  data,
  work,
  actions,
  workActions,
  docked = true,
}: {
  data?: ReactNode;
  work?: ReactNode;
  actions?: ReactNode;
  workActions?: ReactNode;
  docked?: boolean;
}) {
  const column = useRef<HTMLDivElement>(null);
  const dataHeader = useRef<HTMLDivElement>(null);
  const workHeader = useRef<HTMLDivElement>(null);
  const dataContent = useRef<HTMLDivElement>(null);
  const workContent = useRef<HTMLDivElement>(null);
  const [dataCollapsed, setDataCollapsed] = useState(false);
  const [workCollapsed, setWorkCollapsed] = useState(false);
  const [sizes, setSizes] = useState<{ data?: number; work?: number }>({});
  const hasData = data !== undefined;
  const hasWork = work !== undefined;

  useLayoutEffect(() => {
    if (!docked) return;
    let frame: number | undefined;
    const measure = () => {
      const demand = (
        header: HTMLDivElement | null,
        content: HTMLDivElement | null,
        collapsed: boolean,
      ) => ({
        // Round up so fractional line heights don't create a one-pixel scrollbar.
        height:
          Math.ceil(untransformedBorderBoxHeight(header, 36)) +
          (collapsed ? 0 : Math.ceil(untransformedBorderBoxHeight(content)) + 1),
        collapsed,
      });
      const next = sessionSectionHeights(
        untransformedBorderBoxHeight(column.current),
        hasData ? demand(dataHeader.current, dataContent.current, dataCollapsed) : undefined,
        hasWork ? demand(workHeader.current, workContent.current, workCollapsed) : undefined,
      );
      setSizes((current) =>
        current.data === next.data && current.work === next.work ? current : next,
      );
    };
    const schedule = () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    for (const element of [
      column.current,
      dataHeader.current,
      workHeader.current,
      dataContent.current,
      workContent.current,
    ]) {
      if (element) observer.observe(element);
    }
    measure();
    return () => {
      observer.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [docked, hasData, hasWork, dataCollapsed, workCollapsed]);

  return (
    <div
      ref={column}
      data-slot="session-evidence-column"
      className={cn(
        'flex min-h-0 flex-1 flex-col',
        docked ? 'justify-between gap-3' : 'clio-scrollbar overflow-y-auto',
      )}
    >
      {hasData ? (
        <SessionEvidenceSection
          name="Data"
          collapsed={dataCollapsed}
          onToggle={() => setDataCollapsed((value) => !value)}
          height={docked ? sizes.data : undefined}
          docked={docked}
          headerRef={dataHeader}
          contentRef={dataContent}
          actions={actions}
        >
          {data}
        </SessionEvidenceSection>
      ) : null}
      {hasWork ? (
        <SessionEvidenceSection
          name="Work"
          collapsed={workCollapsed}
          onToggle={() => setWorkCollapsed((value) => !value)}
          height={docked ? sizes.work : undefined}
          docked={docked}
          headerRef={workHeader}
          contentRef={workContent}
          actions={
            <>
              {workActions}
              {!hasData ? actions : null}
            </>
          }
        >
          {work}
        </SessionEvidenceSection>
      ) : null}
    </div>
  );
}

function SessionEvidenceSection({
  name,
  children,
  collapsed,
  onToggle,
  height,
  headerRef,
  contentRef,
  actions,
  docked,
}: {
  name: 'Data' | 'Work';
  children: ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  height?: number;
  headerRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  actions: ReactNode;
  docked: boolean;
}) {
  return (
    <section
      aria-label={name}
      data-showcase-section={name === 'Data' ? 'top' : 'bottom'}
      data-section-collapsed={collapsed}
      className={cn(
        'flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden',
        docked
          ? 'rounded-lg bg-popover shadow-md ring-1 ring-foreground/10'
          : 'border-t first:border-t-0',
      )}
      style={{ height }}
    >
      <div
        ref={headerRef}
        data-slot="session-section-header"
        className="flex h-9 shrink-0 items-center gap-0.5 border-b pr-1"
      >
        <h2 className="min-w-0 flex-1">
          <Button
            variant="ghost"
            type="button"
            aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${name}`}
            aria-expanded={!collapsed}
            onClick={onToggle}
            className="h-9 w-full justify-between rounded-none px-3 text-xs font-medium"
          >
            {name}
            <ChevronDownIcon
              aria-hidden="true"
              className={`size-3.5 ${collapsed ? '-rotate-90' : ''}`}
            />
          </Button>
        </h2>
        {actions}
      </div>
      <div hidden={collapsed} className="clio-scrollbar min-h-0 flex-1 overflow-y-auto">
        <div ref={contentRef} className="min-w-0 px-3 py-2">
          {children}
        </div>
      </div>
    </section>
  );
}
