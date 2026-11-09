import { PanelRightOpenIcon } from 'lucide-react';
import { Fragment, useContext, useLayoutEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './primitives/icon-button';
import { WorkbenchTabListSlot, type TabListSlot } from './workbench-tab-list-context';

export function WorkbenchTabListProvider({
  slot,
  children,
}: {
  slot: TabListSlot;
  children: ReactNode;
}) {
  return <WorkbenchTabListSlot.Provider value={slot}>{children}</WorkbenchTabListSlot.Provider>;
}

/**
 * A tab's own list, shown beside the tabs (`title` names it: "Study",
 * "Vault", "Outline"). Outside the workbench, or while the column is hidden,
 * it renders nothing: the tab must stay usable without it.
 */
export function WorkbenchTabList({
  title,
  actions,
  children,
}: {
  title: string;
  /** Icon buttons for the column header, beside the title (a search toggle). */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const slot = useContext(WorkbenchTabListSlot);
  const claim = slot?.claim;
  useLayoutEffect(() => claim?.(title), [claim, title]);
  if (!slot?.host) return null;
  return (
    <Fragment>
      {createPortal(children, slot.host)}
      {actions && slot.actionsHost ? createPortal(actions, slot.actionsHost) : null}
    </Fragment>
  );
}

/** For a frame bar: brings the tab's hidden list back. Absent while it shows. */
export function WorkbenchTabListToggle() {
  const slot = useContext(WorkbenchTabListSlot);
  if (!slot?.title || slot.shown) return null;
  return (
    <IconButton
      label={`Show ${slot.title}`}
      icon={<PanelRightOpenIcon aria-hidden="true" />}
      className="[&_svg]:size-3.5"
      onClick={() => slot.setShown(true)}
    />
  );
}
