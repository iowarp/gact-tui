import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreIcon } from '@/lib/icon-vocabulary';
import { IconButton } from './primitives/icon-button';

const InfraTabActionsContext = createContext<HTMLElement | null>(null);

export const InfraTabActionsProvider = InfraTabActionsContext.Provider;

/** A tab's main verb, which folds into ⋯ on a narrow page while the host stays. */
export interface InfraTabFold {
  /** The verb as drawn on a wide tab bar. */
  verb: ReactNode;
  /** The same verb and its variants as menu rows, for the narrow ⋯. */
  menu: ReactNode;
  /** The ⋯ button's name. */
  label: string;
}

/**
 * Controls for the open Infrastructure tab (host selector, Install service,
 * Inspect again), drawn at the right end of the tab bar. The tab body owns
 * them, so their state stays with the inventory they act on. With `fold`, a
 * page under 600px shows the controls and a ⋯ in place of the verb (spec:
 * "Tab actions fold into ⋯. The host stays."), all as one item beside the tabs.
 */
export function InfraTabActions({ children, fold }: { children: ReactNode; fold?: InfraTabFold }) {
  const target = useContext(InfraTabActionsContext);
  if (!target) return null;
  if (!fold) return createPortal(children, target);
  return createPortal(
    <span className="flex min-w-0 items-center justify-end gap-1.5" data-tab-fold="">
      {children}
      <span className="contents @max-[600px]/infra-page:hidden">{fold.verb}</span>
      <span className="hidden @max-[600px]/infra-page:contents">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <IconButton icon={<MoreIcon />} label={fold.label} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            {fold.menu}
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </span>,
    target,
  );
}
