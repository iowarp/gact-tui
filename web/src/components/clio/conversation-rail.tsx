import type { ReactNode, RefObject } from 'react';
import { useId, useRef, useState } from 'react';
import { Maximize2Icon } from 'lucide-react';
import { useEvidenceDisclosure } from '@/hooks/use-evidence-disclosures';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { ShortcutKeys } from '@/components/clio/primitives/key-chip';
import { ConnectedSourcePicker } from './connected-source-picker';
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
 * The floating "This conversation" rail. The top-bar button pins it open over
 * the transcript, only as tall as its content; it stays until the button,
 * its key or Escape inside it closes it.
 */
export function ConversationRail({
  evidence,
  children,
}: {
  evidence: ClioObservabilityDockProps;
  children: (control: ConversationRailControl) => ReactNode;
}) {
  const [open, setDisclosure] = useEvidenceDisclosure('conversation-rail', false);
  const [selectedSource, setSelectedSource] = useState<{ workspaceId: string; id: string }>();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // The rail is anchored, not triggered, so Radix has no trigger to refocus on close.
  const returnFocus = useRef(false);
  const setOpen = (next: boolean) => {
    if (!next) returnFocus.current = !!panelRef.current?.contains(document.activeElement);
    setDisclosure(next);
  };
  const panelId = useId();
  return (
    <>
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        {children({ open, setOpen, buttonRef, panelId, panelRef })}
        <PopoverAnchor virtualRef={buttonRef} />
        <PopoverContent
          ref={panelRef}
          id={panelId}
          role="region"
          aria-label="This conversation"
          side="bottom"
          align="end"
          sideOffset={8}
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
            open ? document.querySelector('[data-slot="conversation-surface"]') : undefined
          }
          // A maximized canvas covers the conversation, so the rail hides with it.
          className="clio-scrollbar [body:has(aside[data-maximized=true])_&]:hidden max-h-[var(--radix-popover-content-available-height)] w-[min(max(20rem,25vw),calc(100vw-1rem))] gap-0 overflow-y-auto overscroll-contain p-0"
        >
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
                      // The full view replaces the rail; it must not float over the canvas.
                      setOpen(false);
                      evidence.onOpenCanvas?.();
                    }}
                  />
                ) : null}
              </div>
            )}
          />
        </PopoverContent>
      </Popover>
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
