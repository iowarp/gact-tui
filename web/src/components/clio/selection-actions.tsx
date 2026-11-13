import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { useOverlayContainer } from '@/components/ui/overlay-container';
import { useSelectionActionRegistry } from '@/hooks/use-selection-action';
import {
  transcriptSelection,
  createSelectionActionRegistry,
  type SelectionAction,
  type SelectionTarget,
} from '@/lib/selection-actions';
import { fileTextSelection } from '@/lib/selection-actions-file';
import { SelectionActionsContext } from '@/lib/selection-actions-context';
import { useKeyPlatform, useShortcut, useShortcutPresentation } from '@/lib/shortcuts/hooks';
import { chordMatches } from '@/lib/shortcuts/keys';
import { shortcutChords } from '@/lib/shortcuts/registry';
import { t } from '@lingui/core/macro';

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

/** A subtree that offers its own selection actions (the onboarding practice conversation). */
function inLocalSelectionScope(range: Range): boolean {
  const node = range.commonAncestorContainer;
  const element = node instanceof Element ? node : node.parentElement;
  return Boolean(element?.closest('[data-selection-actions="local"]'));
}

function currentAnchor(): Anchor | undefined {
  const selection = window.getSelection();
  const target = transcriptSelection(selection) ?? fileTextSelection(selection);
  if (!target || !selection) return undefined;
  const range = selection.getRangeAt(0);
  if (inLocalSelectionScope(range)) return undefined;
  // Environments without layout (tests, some embedded views) have no range geometry.
  const rect =
    typeof range.getBoundingClientRect === 'function'
      ? range.getBoundingClientRect()
      : { top: 0, left: 0, width: 0 };
  return { target, top: rect.top - TOOLBAR_GAP_PX, left: rect.left + rect.width / 2 };
}

/** The catalog's "menu of the focused thing" key (Shift F10, ⌃↩ on a Mac) or the menu key. */
function isSelectionMenuKey(event: KeyboardEvent, chords: ReturnType<typeof shortcutChords>) {
  return event.key === 'ContextMenu' || chords.some((chord) => chordMatches(chord, event));
}

/**
 * The small action menu shown over a selection in an agent answer or a file
 * viewer's text. It lists
 * whatever the registry offers for that selection, so a new action (More
 * details, Understand attention, ...) is a registration, not a toolbar change.
 * An action with a catalog shortcut shows its key and answers it while shown.
 *
 * Keyboard: with text selected (e.g. by caret browsing), Shift+F10 (⌃↩ on a Mac) or the menu
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
  const overlay = useOverlayContainer();
  const platform = useKeyPlatform();
  const menuKey = useShortcutPresentation('focused-menu');
  const menuChords = useMemo(
    () => (menuKey ? shortcutChords(menuKey.definition, platform) : []),
    [menuKey, platform],
  );

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
      if (!isSelectionMenuKey(event, menuChords)) return;
      event.preventDefault();
      toolbarRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    };
    document.addEventListener('keydown', focusMenu);
    return () => document.removeEventListener('keydown', focusMenu);
  }, [shown, menuChords]);

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
      aria-keyshortcuts={menuKey?.aria}
      aria-label={t`Selection actions`}
      style={{ left: anchor.left, top: Math.max(anchor.top, TOOLBAR_GAP_PX) }}
    >
      <ButtonGroup>
        {actions.map((action) => (
          <SelectionActionButton
            action={action}
            key={action.id}
            onRun={() => {
              action.run(anchor.target);
              window.getSelection()?.removeAllRanges();
              setAnchor(undefined);
            }}
          />
        ))}
      </ButtonGroup>
    </div>,
    overlay ?? document.body,
  );
}

const DOCUMENT_REGION = {
  get current() {
    return typeof document === 'undefined' ? null : document.documentElement;
  },
};

/**
 * One action of the menu, with its key beside the label. Its key works while
 * the menu is up, wherever focus is: the selection, not a tab, is its scope.
 */
function SelectionActionButton({ action, onRun }: { action: SelectionAction; onRun: () => void }) {
  const Icon = action.icon;
  const presentation = useShortcutPresentation(action.shortcut);
  useShortcut(action.shortcut ?? '', onRun, {
    enabled: Boolean(action.shortcut),
    region: DOCUMENT_REGION,
  });
  return (
    <Button
      aria-keyshortcuts={presentation?.aria}
      className="h-7 gap-1.5 px-2 text-xs"
      onClick={onRun}
      size="sm"
      type="button"
      variant="ghost"
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {action.label}
      {presentation ? (
        <kbd
          aria-hidden="true"
          className="font-mono text-[0.65625rem] font-normal text-muted-foreground"
          data-slot="selection-action-shortcut"
        >
          {presentation.text}
        </kbd>
      ) : null}
    </Button>
  );
}
