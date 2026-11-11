import { useCallback, useMemo, useState } from 'react';
import type { TabListSlot } from './workbench-tab-list-context';
import { WorkbenchListHeader, WorkbenchListSection } from './workbench-list-column';

/**
 * The column beside the tabs when the open tab brings its own list (a study
 * tree, vault files, an outline). Over a narrow panel it is a sheet shown on
 * request.
 */
export function useWorkbenchTabListSlot({
  narrow,
  activeTabId,
}: {
  narrow: boolean | undefined;
  activeTabId: string;
}) {
  const [title, setTitle] = useState<string>();
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [actionsHost, setActionsHost] = useState<HTMLSpanElement | null>(null);
  // Unset: the default for the width (beside when wide, hidden when narrow).
  const [open, setOpen] = useState<boolean>();
  const [openFor, setOpenFor] = useState({ tab: activeTabId, narrow });
  if (openFor.tab !== activeTabId || openFor.narrow !== narrow) {
    setOpenFor({ tab: activeTabId, narrow });
    setOpen(undefined);
  }
  const claim = useCallback((next: string) => {
    setTitle(next);
    return () => setTitle((current) => (current === next ? undefined : current));
  }, []);
  const shown = Boolean(title) && (open ?? narrow === false);
  const setShown = useCallback((next: boolean) => setOpen(next), []);
  const picked = useCallback(() => {
    if (narrow) setOpen(false);
  }, [narrow]);
  const slot = useMemo<TabListSlot>(
    () => ({
      host: shown ? host : null,
      actionsHost: shown ? actionsHost : null,
      title,
      shown,
      claim,
      setShown,
      picked,
    }),
    [actionsHost, claim, host, picked, setShown, shown, title],
  );
  const column =
    shown && title ? (
      <WorkbenchListSection title={title} overlay={narrow === true}>
        <WorkbenchListHeader
          title={title}
          actions={<span ref={setActionsHost} className="contents" />}
          onHide={() => setOpen(false)}
        />
        <div
          ref={setHost}
          data-slot="workbench-tab-list"
          className="min-h-0 flex-1 overflow-y-auto"
        />
      </WorkbenchListSection>
    ) : null;
  return { slot, column, setShown };
}
