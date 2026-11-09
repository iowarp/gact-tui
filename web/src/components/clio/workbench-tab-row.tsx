import { AtSignIcon, ChevronDownIcon, PinIcon, PinOffIcon } from 'lucide-react';
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
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sortable, SortableItem, SortableItemHandle } from '@/components/reui/sortable';
import type { WorkspaceReference } from '@clio/core/v3';
import {
  addReferenceToComposer,
  useComposerReferenceAvailable,
} from '@/lib/composer-reference-requests';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { ArtifactTypeIcon } from './artifact-type-icon';
import { fileViewerReference } from './file-viewer-location';
import { ActivityKindIcon } from './workbench-activity-icon';
import { FrameTab } from './primitives/frame-bar';
import { IconButton } from './primitives/icon-button';
import { HeldKeyBadge } from './primitives/key-chip';
import { MenuRow, menuAcceleratorKeyDown } from './primitives/menu-row';
import {
  nextTabRowFit,
  tabChanged,
  workbenchTabIcons,
  workbenchTabLabel,
  workbenchTabPath,
  type TabRowFit,
} from './workbench-tab-icons';
import type { WorkbenchTab } from './workbench-shared';

export function WorkbenchTabIcon({ tab }: { tab: WorkbenchTab }) {
  if (tab.kind === 'artifact' && tab.artifact)
    return <ArtifactTypeIcon artifact={tab.artifact} className="size-3.5" />;
  if (tab.kind === 'activity')
    return <ActivityKindIcon kind={tab.activityKind} className="size-3.5" />;
  const Icon = workbenchTabIcons[tab.kind];
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
 * The frame's tab row: drag to reorder, middle-click or Delete to close, a
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
  // The header, not the scroller: the "All N tabs" button narrows the
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
  const [measured, setMeasured] = useState<{ key: string; fit: TabRowFit }>({
    key: fitKey,
    fit: 'full',
  });
  // Any change starts again from full names; the layout effect below then
  // steps down while the row still overflows, before the browser paints.
  if (measured.key !== fitKey) setMeasured({ key: fitKey, fit: 'full' });
  const fit = measured.key === fitKey ? measured.fit : 'full';
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || fit === 'overflow') return;
    if (host.scrollWidth > host.clientWidth + 1)
      setMeasured((current) =>
        current.key === fitKey ? { key: fitKey, fit: nextTabRowFit(current.fit) } : current,
      );
  }, [fit, fitKey]);

  useShortcut('close-tab', () => onClose(activeTabId), {
    region: stripRef,
    enabled: Boolean(activeTabId),
  });

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
            className="@container no-scrollbar min-w-0 flex-1 overflow-x-auto overflow-y-hidden data-[scrolled-start=true]:[mask-image:linear-gradient(to_right,transparent,black_2rem)]"
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
              onValueChange={onReorder}
              strategy="horizontal"
              value={tabs as WorkbenchTab[]}
            >
              <TabsList className="h-8 w-max justify-start gap-0.5 rounded-none bg-transparent p-0">
                {tabs.map((tab) => {
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
                              aria-keyshortcuts="Delete"
                              className={`${className} h-full justify-start border-0 bg-transparent py-0 font-normal text-inherit shadow-none data-active:bg-transparent data-active:shadow-none dark:data-active:bg-transparent`}
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
                              {active && tabs.length > 1 ? (
                                <HeldKeyBadge id="previous-tab" pairId="next-tab" side="above" />
                              ) : null}
                            </TabsTrigger>
                          </SortableItemHandle>
                        )}
                      />
                    </SortableItem>
                  );
                })}
              </TabsList>
            </Sortable>
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
                <MenuRow accelerator="F" label="Show in Files" />
              </ContextMenuItem>
              <ContextMenuItem
                data-accelerator="Y"
                disabled={menuPath === undefined}
                onSelect={() => {
                  if (menuPath) void navigator.clipboard?.writeText(menuPath);
                }}
              >
                <MenuRow accelerator="Y" label="Copy path" />
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem data-accelerator="C" onSelect={() => onClose(menuTab.id)}>
                <MenuRow accelerator="C" label="Close" />
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
      {fit === 'overflow' ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              icon={<ChevronDownIcon />}
              label={`All ${tabs.length} tabs`}
              tooltipSide="bottom"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 w-64 overflow-y-auto">
            {tabs.map((tab) => (
              <DropdownMenuItem key={tab.id} onSelect={() => onSelect(tab.id)}>
                <MenuRow
                  checked={tab.id === activeTabId}
                  icon={<WorkbenchTabIcon tab={tab} />}
                  label={workbenchTabLabel(tab)}
                />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {trailing}
    </div>
  );
}
