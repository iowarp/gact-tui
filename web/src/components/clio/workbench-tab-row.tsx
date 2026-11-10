import {
  AtSignIcon,
  ChevronDownIcon,
  CopyIcon,
  FolderIcon,
  PinIcon,
  PinOffIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sortable, SortableItem, SortableItemHandle } from '@/components/reui/sortable';
import type { WorkspaceReference } from '@clio/core/v3';
import {
  addReferenceToComposer,
  useComposerReferenceAvailable,
} from '@/lib/composer-reference-requests';
import { CloseIcon } from '@/lib/icon-vocabulary';
import { useShortcut, useShortcutPresentation } from '@/lib/shortcuts/hooks';
import { ArtifactTypeIcon } from './artifact-type-icon';
import { fileViewerReference } from './file-viewer-location';
import { FileTypeIcon } from './file-type-icon';
import { ActivityKindIcon } from './workbench-activity-icon';
import { FrameTab } from './primitives/frame-bar';
import { NamedTooltip } from './primitives/icon-button';
import { focusEditorAtOffset } from './composer-editor-model';
import { HeldKeyBadge } from './primitives/key-chip';
import { MenuRow, menuAcceleratorKeyDown } from './primitives/menu-row';
import {
  nextTabRowFit,
  overflowTabs,
  tabChanged,
  workbenchListTabIcons,
  workbenchTabIcons,
  workbenchTabLabel,
  workbenchTabPath,
  type TabRowFit,
} from './workbench-tab-icons';
import type { WorkbenchTab } from './workbench-shared';

/** The tab list's gap (gap-0.5). */
const TAB_GAP_PX = 2;
/** The "N more tabs" button (px-1.5, count and chevron) and the header gap before it. */
const OVERFLOW_BUTTON_PX = 44;

export function WorkbenchTabIcon({ tab }: { tab: WorkbenchTab }) {
  if (tab.kind === 'artifact' && tab.artifact)
    return <ArtifactTypeIcon artifact={tab.artifact} className="size-3.5" />;
  if (tab.kind === 'activity')
    return <ActivityKindIcon kind={tab.activityKind} className="size-3.5" />;
  // A tab that drops its name keeps a format icon that tells it apart (workbench-lineage).
  if (tab.kind === 'workspace-file') return <FileTypeIcon className="size-3.5" name={tab.path} />;
  const Icon = tab.kind === 'list' ? workbenchListTabIcons[tab.view] : workbenchTabIcons[tab.kind];
  return <Icon aria-hidden="true" className="size-3.5" />;
}

/** The composer reference for a tab that names a file or artifact. */
function workbenchTabReference(
  tab: WorkbenchTab,
  workspaceId: string | undefined,
): WorkspaceReference | undefined {
  if (!workspaceId) return undefined;
  const path = workbenchTabPath(tab);
  if (path !== undefined)
    return fileViewerReference({ kind: 'workspace', path, mediaType: 'text/plain', workspaceId });
  if (tab.kind === 'artifact' && tab.artifact)
    return fileViewerReference({ kind: 'artifact', artifact: tab.artifact, workspaceId });
  if (tab.kind === 'resource')
    return fileViewerReference({ kind: 'resource', resource: tab.resource, workspaceId });
  return undefined;
}

/**
 * A tab shortcut that unmounts the focused tab or its body lands focus on the new
 * active tab, or on the composer when the last tab closed the canvas.
 */
export function refocusActiveCanvasTab(region: Element | null) {
  requestAnimationFrame(() => {
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const tab = region?.isConnected
      ? region.querySelector<HTMLElement>(
          '[data-slot=canvas-tab-row] [role=tab][aria-selected=true]',
        )
      : null;
    if (tab) tab.focus();
    else
      focusEditorAtOffset(
        document.querySelector<HTMLDivElement>('[contenteditable="true"][role="combobox"]'),
      );
  });
}

export interface WorkbenchTabRowProps {
  /** Where "Add to message" sends a file or artifact tab. */
  workspaceId?: string;
  /** Display order: pinned tabs first. */
  tabs: readonly WorkbenchTab[];
  activeTabId: string;
  pinnedIds: ReadonlySet<string>;
  changedPaths: ReadonlySet<string>;
  stripRef: RefObject<HTMLDivElement | null>;
  activeTabRef: RefObject<HTMLDivElement | null>;
  onSelect: (tabId: string) => void;
  onReorder: (tabs: WorkbenchTab[]) => void;
  onClose: (tabId: string) => void;
  onCloseOthers: (tabId: string) => void;
  onCloseToRight: (tabId: string) => void;
  onTogglePin: (tabId: string) => void;
  onMove: (tabId: string, delta: -1 | 1) => void;
  onShowInFiles: (tab: WorkbenchTab) => void;
  /** After the tabs, at the end of the row (Maximize). */
  trailing?: ReactNode;
}

/**
 * The frame's tab row: drag to reorder, middle-click or the close-tab key
 * (Delete, ⌘⌫ on a Mac) to close, a
 * right-click menu with letter keys, pinned tabs first as icons. When the row
 * is short, inactive tabs shrink to icons, then the rest go behind a menu.
 */
export function WorkbenchTabRow({
  tabs,
  activeTabId,
  pinnedIds,
  changedPaths,
  stripRef,
  activeTabRef,
  onSelect,
  onReorder,
  onClose,
  onCloseOthers,
  onCloseToRight,
  onTogglePin,
  onMove,
  onShowInFiles,
  trailing,
  workspaceId,
}: WorkbenchTabRowProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  // The header, not the scroller: the "N more tabs" list button narrows the
  // scroller, and measuring that would undo the fit it caused.
  const headerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [menuTabId, setMenuTabId] = useState<string>();
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const update = () => setWidth(header.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  const pinnedKey = tabs.map((tab) => (pinnedIds.has(tab.id) ? '1' : '0')).join('');
  const fitKey = `${width}|${activeTabId}|${pinnedKey}|${tabs
    .map((tab) => `${tab.id}:${workbenchTabLabel(tab)}`)
    .join('|')}`;
  const [measured, setMeasured] = useState<{ key: string; fit: TabRowFit; shown: number }>({
    key: fitKey,
    fit: 'full',
    shown: 0,
  });
  // Any change starts again from full names; the layout effect below then
  // steps down while the row still overflows, before the browser paints.
  if (measured.key !== fitKey) setMeasured({ key: fitKey, fit: 'full', shown: 0 });
  const fit = measured.key === fitKey ? measured.fit : 'full';
  // Tab ids, the most recently open first: the list at the end takes the least recent.
  const [recency, setRecency] = useState<string[]>([]);
  if (activeTabId && recency[0] !== activeTabId)
    setRecency([
      activeTabId,
      ...recency.filter((id) => id !== activeTabId && tabs.some((tab) => tab.id === id)),
    ]);
  const hidden = fit === 'overflow' ? overflowTabs(tabs, activeTabId, recency, measured.shown) : [];
  const hiddenIds = new Set(hidden.map((tab) => tab.id));
  const shownTabs = hidden.length ? tabs.filter((tab) => !hiddenIds.has(tab.id)) : tabs;
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || host.scrollWidth <= host.clientWidth + 1) return;
    setMeasured((current) => {
      if (current.key !== fitKey) return current;
      if (current.fit === 'full') return { key: fitKey, fit: 'compact', shown: 0 };
      if (current.fit === 'compact') {
        // Into the list in one pass: the compact widths are the ones the
        // shown tabs keep, so count how many fit beside the list button.
        // The loop below still steps down if the estimate is short.
        const widths = new Map<string, number>();
        for (const node of host.querySelectorAll<HTMLElement>('[data-tab-id]'))
          widths.set(node.dataset.tabId ?? '', node.offsetWidth + TAB_GAP_PX);
        const room = host.clientWidth - OVERFLOW_BUTTON_PX;
        let shown = Math.max(0, tabs.length - 2);
        while (shown > 0) {
          const listed = new Set(
            overflowTabs(tabs, activeTabId, recency, shown).map((tab) => tab.id),
          );
          const used = tabs.reduce(
            (sum, tab) => (listed.has(tab.id) ? sum : sum + (widths.get(tab.id) ?? 0)),
            0,
          );
          if (used <= room) break;
          shown -= 1;
        }
        return { key: fitKey, fit: nextTabRowFit(current.fit), shown };
      }
      return current.shown > 0 ? { ...current, shown: current.shown - 1 } : current;
    });
  }, [activeTabId, fit, fitKey, measured.shown, recency, tabs]);

  const closeTabKeys = useShortcutPresentation('close-tab')?.aria;
  useShortcut(
    'close-tab',
    () => {
      onClose(activeTabId);
      refocusActiveCanvasTab(stripRef.current?.closest('aside') ?? null);
    },
    {
      region: stripRef,
      enabled: Boolean(activeTabId),
    },
  );

  const menuTab = tabs.find((tab) => tab.id === menuTabId);
  const menuIndex = menuTab ? tabs.indexOf(menuTab) : -1;
  const menuPath = menuTab ? workbenchTabPath(menuTab) : undefined;
  const composerOpen = useComposerReferenceAvailable(workspaceId);
  const menuReference = menuTab ? workbenchTabReference(menuTab, workspaceId) : undefined;
  const addReason = !menuReference
    ? 'Not a file or artifact'
    : !composerOpen
      ? 'Open a conversation to add it to a message'
      : undefined;

  return (
    <div
      // A layout boundary: fitting and scrolling the tabs never re-lays out the page.
      className="flex h-10 shrink-0 items-center gap-1 border-b border-border bg-background/80 px-1.5 [contain:size_layout_style]"
      data-slot="canvas-header"
      ref={headerRef}
    >
      {/* Non-modal: a modal menu restyles <body> (scroll lock, pointer
          events), which recalculates style for the whole page on open. */}
      <ContextMenu modal={false}>
        <ContextMenuTrigger asChild>
          <div
            className="@container no-scrollbar min-w-0 flex-1 self-stretch overflow-x-auto overflow-y-hidden data-[scrolled-start=true]:[mask-image:linear-gradient(to_right,transparent,black_2rem)]"
            data-fit={fit}
            data-slot="canvas-tab-row"
            onContextMenu={(event: MouseEvent<HTMLDivElement>) => {
              const id = (event.target as Element)
                .closest('[data-tab-id]')
                ?.getAttribute('data-tab-id');
              if (!id) {
                event.preventDefault();
                return;
              }
              setMenuTabId(id);
            }}
            ref={(node) => {
              hostRef.current = node;
              stripRef.current = node;
            }}
          >
            <Sortable
              asChild
              getItemValue={(tab: WorkbenchTab) => tab.id}
              // Only the shown tabs move; the listed ones keep their places.
              onValueChange={(next: WorkbenchTab[]) => {
                if (!hidden.length) return onReorder(next);
                let shownIndex = 0;
                onReorder(
                  tabs.map((tab) => (hiddenIds.has(tab.id) ? tab : (next[shownIndex++] ?? tab))),
                );
              }}
              strategy="horizontal"
              value={shownTabs as WorkbenchTab[]}
            >
              <TabsList
                className="h-full w-max items-stretch justify-start gap-0.5 rounded-none bg-transparent p-0 group-data-horizontal/tabs:h-full"
                variant="line"
              >
                {shownTabs.map((tab) => {
                  const active = tab.id === activeTabId;
                  const label = workbenchTabLabel(tab);
                  const path = workbenchTabPath(tab);
                  return (
                    // dnd-kit's {...attributes} would give this wrapper role="button",
                    // a disallowed child of the tablist (axe aria-required-children);
                    // every ARIA attribute is overridden to undefined so it stays a
                    // plain div. The drag handle is the TabsTrigger (listeners only).
                    <SortableItem
                      aria-describedby={undefined}
                      aria-disabled={undefined}
                      aria-roledescription={undefined}
                      asChild
                      key={tab.id}
                      role={undefined}
                      tabIndex={undefined}
                      value={tab.id}
                    >
                      <FrameTab
                        active={active}
                        changed={tabChanged(tab, changedPaths)}
                        // The row is a size container: one tab never outgrows it.
                        className="max-w-[min(14rem,100cqw)]"
                        compact={fit !== 'full'}
                        data-tab-id={tab.id}
                        icon={<WorkbenchTabIcon tab={tab} />}
                        label={label}
                        onClose={() => onClose(tab.id)}
                        pinned={pinnedIds.has(tab.id)}
                        ref={active ? activeTabRef : undefined}
                        title={path ?? label}
                        renderTrigger={({ className, title, children }) => (
                          <SortableItemHandle asChild>
                            <TabsTrigger
                              aria-keyshortcuts={closeTabKeys}
                              className={`${className} h-full justify-start rounded-none border-0 bg-transparent py-0 font-normal text-inherit shadow-none after:hidden`}
                              onAuxClick={(event) => {
                                if (event.button !== 1) return;
                                event.preventDefault();
                                event.stopPropagation();
                                onClose(tab.id);
                              }}
                              title={title}
                              value={tab.id}
                            >
                              {children}
                            </TabsTrigger>
                          </SortableItemHandle>
                        )}
                      />
                    </SortableItem>
                  );
                })}
              </TabsList>
            </Sortable>
            {/* At the strip's visible end, so it never hides the active tab's name. */}
            {tabs.length > 1 ? (
              <HeldKeyBadge id="previous-tab" pairId="next-tab" side="inside-end" />
            ) : null}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-60" onKeyDown={menuAcceleratorKeyDown}>
          {menuTab ? (
            <>
              <ContextMenuItem data-accelerator="P" onSelect={() => onTogglePin(menuTab.id)}>
                <MenuRow
                  accelerator="P"
                  icon={pinnedIds.has(menuTab.id) ? <PinOffIcon /> : <PinIcon />}
                  label={pinnedIds.has(menuTab.id) ? 'Unpin' : 'Pin'}
                />
              </ContextMenuItem>
              <ContextMenuItem
                data-accelerator="@"
                disabled={addReason !== undefined}
                onSelect={() => {
                  if (menuReference && addReferenceToComposer(menuReference, workspaceId))
                    toast.success(`Added ${menuReference.label} to the message.`);
                }}
                title={addReason}
              >
                <MenuRow accelerator="@" icon={<AtSignIcon />} label="Add to message" />
              </ContextMenuItem>
              <ContextMenuItem
                data-accelerator="F"
                disabled={menuPath === undefined}
                onSelect={() => onShowInFiles(menuTab)}
              >
                <MenuRow accelerator="F" icon={<FolderIcon />} label="Show in Files" />
              </ContextMenuItem>
              <ContextMenuItem
                data-accelerator="Y"
                disabled={menuPath === undefined}
                onSelect={() => {
                  if (menuPath) void navigator.clipboard?.writeText(menuPath);
                }}
              >
                <MenuRow accelerator="Y" icon={<CopyIcon />} label="Copy path" />
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem data-accelerator="C" onSelect={() => onClose(menuTab.id)}>
                <MenuRow accelerator="C" icon={<CloseIcon />} label="Close" />
              </ContextMenuItem>
              <ContextMenuItem
                data-accelerator="O"
                disabled={tabs.length < 2}
                onSelect={() => onCloseOthers(menuTab.id)}
              >
                <MenuRow accelerator="O" label="Close others" />
              </ContextMenuItem>
              <ContextMenuItem
                data-accelerator="R"
                disabled={menuIndex >= tabs.length - 1}
                onSelect={() => onCloseToRight(menuTab.id)}
              >
                <MenuRow accelerator="R" label="Close to the right" />
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem disabled={menuIndex <= 0} onSelect={() => onMove(menuTab.id, -1)}>
                <MenuRow label="Move left" />
              </ContextMenuItem>
              <ContextMenuItem
                disabled={menuIndex >= tabs.length - 1}
                onSelect={() => onMove(menuTab.id, 1)}
              >
                <MenuRow label="Move right" />
              </ContextMenuItem>
            </>
          ) : null}
        </ContextMenuContent>
      </ContextMenu>
      {hidden.length ? (
        <DropdownMenu>
          <NamedTooltip label={`${hidden.length} more tabs`}>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={`${hidden.length} more tabs`}
                className="h-7 shrink-0 gap-0.5 rounded-[6px] px-1.5 font-mono text-[11.5px] text-muted-foreground tabular-nums hover:bg-hover hover:text-foreground aria-expanded:bg-hover aria-expanded:text-foreground"
                data-slot="tab-overflow"
                variant="ghost"
              >
                {hidden.length}
                <ChevronDownIcon aria-hidden="true" className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
          </NamedTooltip>
          <DropdownMenuContent align="end" className="max-h-80 w-64 overflow-y-auto">
            {hidden.map((tab) => (
              <DropdownMenuItem key={tab.id} onSelect={() => onSelect(tab.id)}>
                <MenuRow icon={<WorkbenchTabIcon tab={tab} />} label={workbenchTabLabel(tab)} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {trailing}
    </div>
  );
}
