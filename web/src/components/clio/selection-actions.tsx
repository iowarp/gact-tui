import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { useSelectionActionRegistry } from '@/hooks/use-selection-action';
import {
  transcriptSelection,
  createSelectionActionRegistry,
  type SelectionTarget,
} from '@/lib/selection-actions';
import { SelectionActionsContext } from '@/lib/selection-actions-context';

/** Owns the one selection-action registry every selectable surface shares. */
export function SelectionActionsProvider({ children }: { children: ReactNode }) {
  const registry = useMemo(() => createSelectionActionRegistry(), []);
  return (
    <SelectionActionsContext.Provider value={registry}>{children}</SelectionActionsContext.Provider>
  );
}

interface Anchor {
  target: SelectionTarget;
  top: number;
  left: number;
}

const TOOLBAR_GAP_PX = 8;

function currentAnchor(): Anchor | undefined {
  const selection = window.getSelection();
  const target = transcriptSelection(selection);
  if (!target || !selection) return undefined;
  const range = selection.getRangeAt(0);
  // Environments without layout (tests, some embedded views) have no range geometry.
  const rect =
    typeof range.getBoundingClientRect === 'function'
      ? range.getBoundingClientRect()
      : { top: 0, left: 0, width: 0 };
  return { target, top: rect.top - TOOLBAR_GAP_PX, left: rect.left + rect.width / 2 };
}

/** The platform "actions for this selection" keys: Shift+F10 or the menu key. */
function isSelectionMenuKey(event: KeyboardEvent): boolean {
  return (event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu';
}

/**
 * The small action menu shown over a selection in an agent answer. It lists
 * whatever the registry offers for that selection, so a new action (More
 * details, Understand attention, ...) is a registration, not a toolbar change.
 *
 * Keyboard: with text selected (e.g. by caret browsing), Shift+F10 or the menu
 * key moves focus into the menu; Tab moves between actions, Enter runs one, and
 * Escape dismisses the menu and clears the selection.
 */
export function ClioSelectionActionToolbar() {
  const registry = useSelectionActionRegistry();
  // Re-render when an action is registered or withdrawn while a selection is shown.
  const [, registryChanged] = useReducer((count: number) => count + 1, 0);
  useEffect(() => registry.subscribe(registryChanged), [registry]);
  const [anchor, setAnchor] = useState<Anchor>();
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // While the menu itself has focus, it acts on the selection it was
        // opened for; moving focus into it must not re-read (or lose) that.
        if (toolbarRef.current?.contains(document.activeElement)) return;
        setAnchor(currentAnchor());
      });
    };
    document.addEventListener('selectionchange', update);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('selectionchange', update);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, []);

  const actions = anchor ? registry.actionsFor(anchor.target) : [];
  const shown = Boolean(anchor && actions.length);
  useEffect(() => {
    if (!shown) return;
    const focusMenu = (event: KeyboardEvent) => {
      if (!isSelectionMenuKey(event)) return;
      event.preventDefault();
      toolbarRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    };
    document.addEventListener('keydown', focusMenu);
    return () => document.removeEventListener('keydown', focusMenu);
  }, [shown]);

  if (!anchor || !actions.length) return null;
  return createPortal(
    <div
      className="fixed z-50 -translate-x-1/2 -translate-y-full rounded-lg border bg-popover p-0.5 text-popover-foreground shadow-md"
      data-slot="selection-actions"
      // Keep the selection alive while an action is pressed.
      onMouseDown={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        window.getSelection()?.removeAllRanges();
        setAnchor(undefined);
      }}
      ref={toolbarRef}
      role="toolbar"
      aria-keyshortcuts="Shift+F10"
      aria-label="Selection actions"
      style={{ left: anchor.left, top: Math.max(anchor.top, TOOLBAR_GAP_PX) }}
    >
      <ButtonGroup>
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Button
              className="h-7 gap-1.5 px-2 text-xs"
              key={action.id}
              onClick={() => {
                action.run(anchor.target);
                window.getSelection()?.removeAllRanges();
                setAnchor(undefined);
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Icon aria-hidden="true" className="size-3.5" />
              {action.label}
            </Button>
          );
        })}
      </ButtonGroup>
    </div>,
    document.body,
  );
}
