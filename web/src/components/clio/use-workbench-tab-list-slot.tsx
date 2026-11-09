import { useCallback, useMemo, useState } from 'react';
import type { TabListSlot } from './workbench-tab-list-context';
import { WorkbenchListHeader, WorkbenchListSection } from './workbench-list-column';

/**
 * The column beside the tabs when the open tab brings its own list (a study
 * tree, vault files, an outline). A list chosen on the strip takes precedence;
 * over a narrow panel the tab's list is a sheet shown on request, like the
 * strip's lists.
 */
export function useWorkbenchTabListSlot({
  narrow,
  activeTabId,
  stripListShown,
  hideStripList,
}: {
  narrow: boolean | undefined;
  activeTabId: string;
  stripListShown: boolean;
  hideStripList: () => void;
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
  const shown = Boolean(title) && !stripListShown && (open ?? narrow === false);
  const setShown = useCallback(
    (next: boolean) => {
      if (next) hideStripList();
      setOpen(next);
    },
    [hideStripList],
  );
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
