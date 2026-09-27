import { useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { useSelectionActionRegistry } from '@/hooks/use-selection-action';
import {
  agentAnswerSelection,
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
  const target = agentAnswerSelection(selection);
  if (!target || !selection) return undefined;
  const range = selection.getRangeAt(0);
  // Environments without layout (tests, some embedded views) have no range geometry.
  const rect =
    typeof range.getBoundingClientRect === 'function'
      ? range.getBoundingClientRect()
      : { top: 0, left: 0, width: 0 };
  return { target, top: rect.top - TOOLBAR_GAP_PX, left: rect.left + rect.width / 2 };
}

/**
 * The small action menu shown over a selection in an agent answer. It lists
 * whatever the registry offers for that selection, so a new action (More
 * details, Understand attention, ...) is a registration, not a toolbar change.
 */
export function ClioSelectionActionToolbar() {
  const registry = useSelectionActionRegistry();
  // Re-render when an action is registered or withdrawn while a selection is shown.
  const [, registryChanged] = useReducer((count: number) => count + 1, 0);
  useEffect(() => registry.subscribe(registryChanged), [registry]);
  const [anchor, setAnchor] = useState<Anchor>();

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setAnchor(currentAnchor()));
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
  if (!anchor || !actions.length) return null;
  return createPortal(
    <div
      className="fixed z-50 -translate-x-1/2 -translate-y-full rounded-lg border bg-popover p-0.5 text-popover-foreground shadow-md"
      data-slot="selection-actions"
      // Keep the selection alive while an action is pressed.
      onMouseDown={(event) => event.preventDefault()}
      role="toolbar"
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
