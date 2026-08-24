import type {
  AgentBlueprint,
  Artifact as ArtifactEntity,
  SessionDiff,
  SubagentRun,
  WorkspaceFileEntry,
} from '@clio/core/v3';
import {
  ActivityIcon,
  BoxIcon,
  BoxesIcon,
  FileCode2Icon,
  FileDiffIcon,
  Layers3Icon,
  Maximize2Icon,
  Minimize2Icon,
  XIcon,
} from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { ArtifactView, BlueprintFileView, WorkspaceFileView } from './resource-viewers';
import { ClioSubagentCanvasView } from './subagent-canvas-view';
import type { SubagentOpenTarget } from './subagent-card';
import { DiffCanvasView } from './diff-canvas-view';
import {
  BlueprintView,
  CanvasLauncher,
  ResourceBrowser,
  type ResourceSection,
} from './workbench-resource-browser';

type WorkbenchTab =
  | { id: 'session'; kind: 'session'; label: 'Observability' }
  | { id: 'resources'; kind: 'resources'; label: 'Workspace' }
  | { id: string; kind: 'workspace-file'; label: string; path: string; workspaceId: string }
  | {
      id: string;
      kind: 'diff';
      label: string;
      diff: SessionDiff;
      sessionId: string;
      workspaceId: string;
    }
  | {
      id: string;
      kind: 'blueprint-file';
      label: string;
      path: string;
      blueprintId: string;
      sessionId: string;
      workspaceId: string;
    }
  | {
      id: string;
      kind: 'artifact';
      label: string;
      artifact: ArtifactEntity;
      workspaceId: string;
    }
  | {
      id: string;
      kind: 'blueprint';
      label: string;
      blueprint: AgentBlueprint;
      sessionId: string;
      workspaceId: string;
    }
  | {
      id: string;
      kind: 'subagent';
      label: string;
      subagent: SubagentRun;
      workspaceId: string;
    };

export interface ClioWorkbenchProps {
  workspaceId: string;
  sessionId: string;
  files: readonly WorkspaceFileEntry[];
  filesPending?: boolean;
  filesError?: string;
  artifacts: readonly ArtifactEntity[];
  blueprints: readonly AgentBlueprint[];
  blueprintsPending?: boolean;
  blueprintsError?: string;
  diffs: readonly SessionDiff[];
  diffActionError?: string;
  diffActionPending?: boolean;
  sessionView: ReactNode;
  onApplyDiff: (sessionId: string, workspaceId: string, path: string) => Promise<unknown>;
  onOpenSubagent: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  onRejectDiff: (sessionId: string, workspaceId: string, path: string) => Promise<unknown>;
  requestedOpen?: { key: string; request: ClioWorkbenchOpenRequest };
}

export type ClioWorkbenchOpenRequest =
  | { kind: 'workspace-file'; path: string }
  | { kind: 'diff'; diff: SessionDiff }
  | { kind: 'artifact'; artifact: ArtifactEntity }
  | { kind: 'blueprint'; blueprint: AgentBlueprint }
  | { kind: 'subagent'; subagent: SubagentRun }
  | { kind: 'resources'; section?: ResourceSection }
  | { kind: 'session' };

export interface ClioWorkbenchHandle {
  open: (request: ClioWorkbenchOpenRequest) => void;
}

const resourcesTab: WorkbenchTab = { id: 'resources', kind: 'resources', label: 'Workspace' };
const sessionTab: WorkbenchTab = { id: 'session', kind: 'session', label: 'Observability' };

export const ClioWorkbench = forwardRef<ClioWorkbenchHandle, ClioWorkbenchProps>(
  function ClioWorkbench(
    {
      workspaceId,
      sessionId,
      files,
      filesPending,
      filesError,
      artifacts,
      blueprints,
      blueprintsPending,
      blueprintsError,
      diffs,
      diffActionError,
      diffActionPending,
      sessionView,
      onApplyDiff,
      onOpenSubagent,
      onRejectDiff,
      requestedOpen,
    },
    ref,
  ) {
    const [tabs, setTabs] = useState<WorkbenchTab[]>([sessionTab]);
    const [activeTabId, setActiveTabId] = useState<string>(sessionTab.id);
    const [resourceSection, setResourceSection] = useState<ResourceSection>('files');
    const [maximized, setMaximized] = useState(false);
    const activeTabRef = useRef<HTMLButtonElement>(null);
    const tabStripRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
      const strip = tabStripRef.current;
      const activeTab = activeTabRef.current?.parentElement;
      if (!strip || !activeTab) return;
      const left = activeTab.offsetLeft;
      const right = left + activeTab.offsetWidth;
      if (left < strip.scrollLeft) strip.scrollTo({ behavior: 'smooth', left });
      else if (right > strip.scrollLeft + strip.clientWidth) {
        strip.scrollTo({ behavior: 'smooth', left: right - strip.clientWidth });
      }
    }, [activeTabId, tabs.length]);

    const openTab = useCallback((tab: WorkbenchTab) => {
      setTabs((current) =>
        current.some((item) => item.id === tab.id)
          ? current.map((item) => (item.id === tab.id ? tab : item))
          : [...current, tab],
      );
      setActiveTabId(tab.id);
    }, []);
    const closeTab = (tabId: string) => {
      const index = tabs.findIndex((tab) => tab.id === tabId);
      const next = tabs.filter((tab) => tab.id !== tabId);
      setTabs(next);
      if (activeTabId === tabId) {
        setActiveTabId(next[Math.max(0, index - 1)]?.id ?? sessionTab.id);
      }
    };

    const openResourceSection = (section: ResourceSection) => {
      setResourceSection(section);
      openTab(resourcesTab);
    };

    const openRequest = useCallback(
      (request: ClioWorkbenchOpenRequest) => {
        if (request.kind === 'workspace-file') {
          openTab({
            id: `workspace-file:${request.path}`,
            kind: 'workspace-file',
            label: fileName(request.path),
            path: request.path,
            workspaceId,
          });
        } else if (request.kind === 'diff') {
          openTab({
            id: `diff:${sessionId}:${request.diff.path}`,
            kind: 'diff',
            label: fileName(request.diff.path),
            diff: request.diff,
            sessionId,
            workspaceId,
          });
        } else if (request.kind === 'artifact') {
          openTab({
            id: `artifact:${request.artifact.id}`,
            kind: 'artifact',
            label: request.artifact.name,
            artifact: request.artifact,
            workspaceId: request.artifact.workspace_id ?? workspaceId,
          });
        } else if (request.kind === 'blueprint') {
          openTab({
            id: `blueprint:${request.blueprint.id}`,
            kind: 'blueprint',
            label: request.blueprint.display_name,
            blueprint: request.blueprint,
            sessionId,
            workspaceId,
          });
        } else if (request.kind === 'subagent') {
          openTab({
            id: `subagent:${request.subagent.child_session_id ?? request.subagent.id}`,
            kind: 'subagent',
            label: request.subagent.title,
            subagent: request.subagent,
            workspaceId,
          });
        } else if (request.kind === 'resources') {
          setResourceSection(request.section ?? 'files');
          openTab(resourcesTab);
        } else {
          openTab(sessionTab);
        }
      },
      [openTab, sessionId, workspaceId],
    );

    useImperativeHandle(ref, () => ({ open: openRequest }), [openRequest]);

    useEffect(() => {
      if (!maximized) return;
      const restore = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        setMaximized(false);
      };
      window.addEventListener('keydown', restore, true);
      return () => window.removeEventListener('keydown', restore, true);
    }, [maximized]);

    const canvas = (
      <aside
        aria-label="Workspace canvas"
        data-maximized={maximized || undefined}
        className={cn(
          'flex h-full min-w-0 flex-col bg-card/45',
          maximized && 'fixed inset-0 z-[80] bg-background shadow-2xl',
        )}
      >
        <WorkbenchRequestDispatcher onOpen={openRequest} requestedOpen={requestedOpen} />
        <Tabs className="min-h-0 flex-1 gap-0" onValueChange={setActiveTabId} value={activeTabId}>
          <div className="flex h-14 shrink-0 items-stretch border-b bg-background/80">
            <div
              className="clio-scrollbar min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
              ref={tabStripRef}
            >
              <TabsList
                className="h-14 min-w-full w-max gap-0 rounded-none bg-transparent p-0"
                variant="line"
              >
                {tabs.map((tab) => (
                  <div
                    className="group/tab flex h-14 min-w-28 max-w-48 shrink-0 items-center border-r"
                    key={tab.id}
                  >
                    <TabsTrigger
                      className="h-full min-w-0 flex-1 rounded-none px-3"
                      ref={tab.id === activeTabId ? activeTabRef : undefined}
                      value={tab.id}
                    >
                      <TabIcon kind={tab.kind} />
                      <span className="truncate">{tab.label}</span>
                    </TabsTrigger>
                    {tab.id !== sessionTab.id ? (
                      <Button
                        aria-label={`Close ${tab.label}`}
                        className="mr-1 size-6 opacity-60 hover:opacity-100 focus-visible:opacity-100"
                        onClick={() => closeTab(tab.id)}
                        size="icon-xs"
                        variant="ghost"
                      >
                        <XIcon aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>
                ))}
              </TabsList>
            </div>
            <CanvasLauncher onOpen={openResourceSection} />
            <Button
              aria-label={maximized ? 'Restore canvas beside conversation' : 'Maximize canvas'}
              className="h-14 w-12 rounded-none border-l"
              onClick={() => setMaximized((value) => !value)}
              size="icon"
              title={maximized ? 'Restore canvas' : 'Maximize canvas'}
              variant="ghost"
            >
              {maximized ? (
                <Minimize2Icon aria-hidden="true" />
              ) : (
                <Maximize2Icon aria-hidden="true" />
              )}
            </Button>
          </div>
          {tabs.map((tab) => (
            <TabsContent className="m-0 min-h-0 overflow-hidden" key={tab.id} value={tab.id}>
              {tab.kind === 'session' ? (
                sessionView
              ) : tab.kind === 'resources' ? (
                <ResourceBrowser
                  artifacts={artifacts}
                  blueprints={blueprints}
                  blueprintsError={blueprintsError}
                  blueprintsPending={blueprintsPending}
                  files={files}
                  filesError={filesError}
                  filesPending={filesPending}
                  onSectionChange={setResourceSection}
                  onOpenArtifact={(artifact) =>
                    openTab({
                      id: `artifact:${artifact.id}`,
                      kind: 'artifact',
                      label: artifact.name,
                      artifact,
                      workspaceId: artifact.workspace_id ?? workspaceId,
                    })
                  }
                  onOpenBlueprint={(blueprint) =>
                    openTab({
                      id: `blueprint:${blueprint.id}`,
                      kind: 'blueprint',
                      label: blueprint.display_name,
                      blueprint,
                      sessionId,
                      workspaceId,
                    })
                  }
                  onOpenFile={(path) =>
                    openTab({
                      id: `workspace-file:${path}`,
                      kind: 'workspace-file',
                      label: fileName(path),
                      path,
                      workspaceId,
                    })
                  }
                  section={resourceSection}
                />
              ) : tab.kind === 'workspace-file' ? (
                <WorkspaceFileView
                  path={tab.path}
                  size={files.find((file) => file.path === tab.path)?.size}
                  workspaceId={tab.workspaceId}
                />
              ) : tab.kind === 'diff' ? (
                <DiffCanvasView
                  diff={
                    tab.sessionId === sessionId
                      ? (diffs.find((candidate) => candidate.path === tab.diff.path) ?? tab.diff)
                      : tab.diff
                  }
                  error={diffActionError}
                  onApply={(path) => onApplyDiff(tab.sessionId, tab.workspaceId, path)}
                  onOpenFile={(path) =>
                    openTab({
                      id: `workspace-file:${tab.workspaceId}:${path}`,
                      kind: 'workspace-file',
                      label: fileName(path),
                      path,
                      workspaceId: tab.workspaceId,
                    })
                  }
                  onReject={(path) => onRejectDiff(tab.sessionId, tab.workspaceId, path)}
                  pending={diffActionPending}
                />
              ) : tab.kind === 'blueprint-file' ? (
                <BlueprintFileView
                  blueprintId={tab.blueprintId}
                  path={tab.path}
                  sessionId={tab.sessionId}
                  workspaceId={tab.workspaceId}
                />
              ) : tab.kind === 'artifact' ? (
                <ArtifactView
                  artifact={tab.artifact}
                  files={tab.workspaceId === workspaceId ? files : []}
                  workspaceId={tab.workspaceId}
                />
              ) : tab.kind === 'blueprint' ? (
                <BlueprintView
                  blueprint={tab.blueprint}
                  onOpenFile={(path) =>
                    openTab({
                      id: `blueprint-file:${tab.blueprint.id}:${path}`,
                      kind: 'blueprint-file',
                      label: fileName(path),
                      path,
                      blueprintId: tab.blueprint.id,
                      sessionId: tab.sessionId,
                      workspaceId: tab.workspaceId,
                    })
                  }
                  sessionId={tab.sessionId}
                  workspaceId={tab.workspaceId}
                />
              ) : (
                <ClioSubagentCanvasView
                  activeSessionId={sessionId}
                  onOpenArtifact={(artifact) =>
                    openTab({
                      id: `artifact:${artifact.id}`,
                      kind: 'artifact',
                      label: artifact.name,
                      artifact,
                      workspaceId: artifact.workspace_id ?? tab.workspaceId,
                    })
                  }
                  onOpenConversation={(subagent) => onOpenSubagent(subagent, 'conversation')}
                  onOpenFile={(path) =>
                    openTab({
                      id: `workspace-file:${path}`,
                      kind: 'workspace-file',
                      label: fileName(path),
                      path,
                      workspaceId: tab.workspaceId,
                    })
                  }
                  onOpenSubagent={(subagent, target) => {
                    if (target === 'conversation') onOpenSubagent(subagent, target);
                    else
                      openTab({
                        id: `subagent:${subagent.child_session_id ?? subagent.id}`,
                        kind: 'subagent',
                        label: subagent.title,
                        subagent,
                        workspaceId: tab.workspaceId,
                      });
                  }}
                  subagent={tab.subagent}
                  workspaceId={tab.workspaceId}
                />
              )}
            </TabsContent>
          ))}
        </Tabs>
      </aside>
    );

    return canvas;
  },
);

function WorkbenchRequestDispatcher({
  onOpen,
  requestedOpen,
}: {
  onOpen: (request: ClioWorkbenchOpenRequest) => void;
  requestedOpen?: { key: string; request: ClioWorkbenchOpenRequest };
}) {
  // Compact layouts mount the workbench only after their sheet opens. Keeping
  // the event in props lets this mounted child deliver the first resource
  // request instead of silently showing only the default Observability tab.
  useEffect(() => {
    if (requestedOpen) onOpen(requestedOpen.request);
  }, [onOpen, requestedOpen]);
  return null;
}

function TabIcon({ kind }: { kind: WorkbenchTab['kind'] }) {
  const Icon =
    kind === 'session'
      ? ActivityIcon
      : kind === 'diff'
        ? FileDiffIcon
        : kind === 'subagent'
          ? BoxesIcon
          : kind === 'resources'
            ? Layers3Icon
            : kind === 'artifact'
              ? BoxIcon
              : kind === 'blueprint'
                ? BoxesIcon
                : FileCode2Icon;
  return <Icon aria-hidden="true" className="size-3.5" />;
}

function fileName(path: string): string {
  return (
    path
      .split(/[\\/]+/)
      .filter(Boolean)
      .at(-1) ?? path
  );
}
