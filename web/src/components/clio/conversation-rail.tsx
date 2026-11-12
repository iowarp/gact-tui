import type { KeyboardEvent, ReactNode, RefObject } from 'react';
import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2Icon } from 'lucide-react';
import { useEvidenceDisclosure } from '@/hooks/use-evidence-disclosures';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { ShortcutKeys } from '@/components/clio/primitives/key-chip';
import { ConnectedSourcePicker } from './connected-source-picker';
import { useConversationRailDock } from './conversation-rail-dock';
import { SessionRailContent } from './session-rail-content';
import type { ClioObservabilityDockProps } from './observability-dock-shell';

export interface ConversationRailControl {
  open: boolean;
  setOpen: (open: boolean) => void;
  buttonRef: RefObject<HTMLButtonElement | null>;
  panelId: string;
  /** The rail's content, for focusing a section after opening it from the keyboard. */
  panelRef: RefObject<HTMLDivElement | null>;
}

/**
 * The "This conversation" rail. User-directed change to the spec's floating
 * rail: while the right pocket is closed and the conversation has room, the
 * rail docks beside it; opening the pocket folds it back to its button and
 * closing the pocket brings it back. Under the spec's 900 px rail rule it
 * floats over the transcript, only as tall as its content. Either way it stays
 * until the button, its key or Escape inside it closes it.
 */
export function ConversationRail({
  evidence,
  children,
}: {
  evidence: ClioObservabilityDockProps;
  children: (control: ConversationRailControl) => ReactNode;
}) {
  const [pinned, setPinned] = useEvidenceDisclosure('conversation-rail', false);
  const dock = useConversationRailDock();
  // Opened over an open pocket, the rail floats until the pocket closes, then docks.
  const [overPocket, setOverPocket] = useState(false);
  if (overPocket && !dock.pocketOpen) setOverPocket(false);
  const docked = pinned && dock.dockable && dock.host !== null;
  const floating = !docked && pinned && (!dock.pocketOpen || overPocket);
  const open = docked || floating;
  const [selectedSource, setSelectedSource] = useState<{ workspaceId: string; id: string }>();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // The rail hangs from the bar holding its button, not from the button, so the
  // gap under the bar is the same whatever the button's height.
  const anchorRef = useRef({
    getBoundingClientRect: (): DOMRect => {
      const button = buttonRef.current;
      const rect = button?.getBoundingClientRect();
      const bar = button?.closest('header')?.getBoundingClientRect();
      if (!rect || !bar) return rect ?? ({} as DOMRect);
      return {
        x: rect.x,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        y: bar.top,
        top: bar.top,
        bottom: bar.bottom,
        height: bar.height,
        toJSON: () => undefined,
      };
    },
    // Lets the positioner follow the button when the canvas opens and the bar reflows.
    get contextElement() {
      return buttonRef.current ?? undefined;
    },
  });
  // The rail is anchored, not triggered, so Radix has no trigger to refocus on close.
  const returnFocus = useRef(false);
  const setOpen = (next: boolean) => {
    if (!next) {
      returnFocus.current = !!panelRef.current?.contains(document.activeElement);
      setOverPocket(false);
      setPinned(false);
      // A docked rail unmounts without Radix's close hook, so focus returns here.
      if (docked && returnFocus.current) {
        returnFocus.current = false;
        requestAnimationFrame(() => buttonRef.current?.focus());
      }
      return;
    }
    if (dock.pocketOpen) setOverPocket(true);
    setPinned(true);
  };
  const panelId = useId();
  const content = (
    <SessionRailContent
      evidence={evidence}
      onOpenSource={(source) =>
        setSelectedSource({ workspaceId: evidence.workspaceId!, id: source.id })
      }
      header={(customize) => (
        <div className="flex h-9 shrink-0 items-center gap-1 pl-3 pr-1.5">
          <h2 className="mr-auto truncate text-xs font-normal text-muted-foreground">
            This conversation
          </h2>
          <ShortcutKeys id="conversation-runs" variant="caps" />
          {customize}
          {evidence.onOpenCanvas ? (
            <IconButton
              size="sm"
              label="Open full view"
              icon={<Maximize2Icon aria-hidden="true" />}
              onClick={() => {
                // The full view opens the pocket, which folds the rail away; it
                // returns when the pocket closes. It never floats over the canvas.
                setOverPocket(false);
                if (!docked) setPinned(false);
                evidence.onOpenCanvas?.();
              }}
            />
          ) : null}
        </div>
      )}
    />
  );
  const closeOnEscape = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    // Menus inside the rail portal out; their Escape closes only themselves.
    if (!panelRef.current?.contains(event.target as Node)) return;
    event.preventDefault();
    setOpen(false);
  };
  return (
    <>
      <Popover open={floating} onOpenChange={setOpen} modal={false}>
        {children({ open, setOpen, buttonRef, panelId, panelRef })}
        <PopoverAnchor virtualRef={anchorRef} />
        <PopoverContent
          ref={panelRef}
          id={panelId}
          role="region"
          aria-label="This conversation"
          side="bottom"
          align="end"
          sideOffset={10}
          collisionPadding={8}
          data-slot="conversation-rail"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            // Only return focus to the button when it left from inside the rail.
            event.preventDefault();
            if (returnFocus.current) buttonRef.current?.focus();
            returnFocus.current = false;
          }}
          // Pinned: clicking the transcript or a tab leaves it open.
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            if (!panelRef.current?.contains(document.activeElement)) event.preventDefault();
          }}
          collisionBoundary={
            floating ? document.querySelector('[data-slot="conversation-surface"]') : undefined
          }
          // A maximized canvas, or the canvas sheet on a narrow window, covers the
          // conversation, so the rail hides with it.
          className="clio-scrollbar [body[data-canvas-maximized]_&]:hidden [body[data-canvas-sheet]_&]:hidden max-h-[var(--radix-popover-content-available-height)] w-[min(max(20rem,25vw),calc(100vw-1rem))] gap-0 overflow-y-auto overscroll-contain p-0"
        >
          {floating ? content : null}
        </PopoverContent>
      </Popover>
      {docked
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              role="region"
              aria-label="This conversation"
              data-slot="conversation-rail"
              data-docked=""
              onKeyDown={closeOnEscape}
              className="clio-scrollbar flex h-full w-[max(17.5rem,22vw)] flex-col overflow-y-auto overscroll-contain border-l border-border bg-background"
            >
              {content}
            </div>,
            dock.host!,
          )
        : null}
      {evidence.workspaceId ? (
        <ConnectedSourcePicker
          workspaceId={evidence.workspaceId}
          manageOnly
          initialSourceId={selectedSource?.id}
          open={selectedSource?.workspaceId === evidence.workspaceId}
          onOpenChange={(next) => {
            if (!next) setSelectedSource(undefined);
          }}
        />
      ) : null}
    </>
  );
}
