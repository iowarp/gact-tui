import { useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { HammerIcon } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { LatexOutlineNode, LatexReport } from '@clio/core/v3';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { useContainerQuery } from '@/hooks/use-container-query';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { VIEWER_BYTES_GC_TIME_MS } from '@/lib/runtime-limits';
import { useSharedNow } from '@/lib/shared-clock';
import { useConnectionSettings } from '@/providers/connection-provider';
import { CommentCapture } from './comments/comment-capture';
import { pdfRegionAnchor } from './comments/region-anchors';
import type { PdfHighlight } from './document-pdf-viewer';
import { FileViewerInformationHost } from './file-viewer-context';
import { FileViewerFactsRegistry, useFileViewerTitle } from './file-viewer-facts';
import { LatexFacts, LatexFormat, LatexFrame } from './latex-frame-controls';
import { LatexListSections } from './latex-list';
import {
  builtAgo,
  latexCrumbs,
  latexDefaultView,
  latexModes,
  latexOutlineRows,
  latexProblems,
  type LatexPlace,
  type LatexProblem,
  type LatexView,
} from './latex-model';
import { LatexSourcePane } from './latex-source-pane';
import { ClioPdfPreview } from './pdf-preview';
import { StateView } from './primitives/state-view';
import { useFrameTool } from './primitives/frame-modes';
import { ViewerToolbarContent } from './viewer-toolbar';
import { ViewerToolbarHost } from './viewer-toolbar-context';
import { matchesListQuery, useWorkbenchListSearch } from './workbench-list-search';
import { WorkbenchTabList } from './workbench-tab-list';
import { WorkbenchTabListSlot } from './workbench-tab-list-context';

function entryFile(report: LatexReport): string {
  const prefix = report.folder ? `${report.folder}/` : '';
  return report.entry.startsWith(prefix) ? report.entry.slice(prefix.length) : report.entry;
}

const NO_TEXTS: Record<string, string> = {};
const PANE = 'm-0 min-h-0 min-w-0 flex-1';

function paneName(view: LatexView) {
  const label = latexModes(true).find((mode) => mode.value === view)?.label ?? view;
  return { 'aria-label': label, 'aria-labelledby': undefined };
}
/** The section width below which Side by side gives way to one pane. */
const BOTH_MIN_WIDTH = 480;

/**
 * The LaTeX workspace (LaTeX plan): the compiled PDF (Render), its source with
 * each line's build problems in the gutter (Source), or both side by side, with
 * click-through both ways (click a source line; double-click the PDF) and the
 * comment layer on both panes. Its outline and build problems are the list
 * beside the tabs. The server builds, maps and checks; the last successful build
 * stays visible while a new one runs.
 */
export function LatexWorkspace({
  artifactId,
  sessionId,
  framed,
  source,
}: {
  artifactId: string;
  sessionId: string;
  /** A frame bar above takes the controls (a document's own); else detected from the file viewer. */
  framed?: boolean;
  /** The .tex itself, shown as Source when the paper cannot be built. */
  source?: { name: string; text: string };
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const report = useQuery({
    queryKey: queryKeys.key('latex-report', settings.endpoint, artifactId),
    queryFn: ({ signal }) => repository.latexReport(artifactId, sessionId, signal),
    enabled: Boolean(sessionId),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    retry: false,
  });
  const pdfId = report.data?.build.pdf?.artifact_id;
  const pdf = useQuery({
    queryKey: queryKeys.key('document-content', settings.endpoint, pdfId),
    queryFn: ({ signal }) => repository.documentContent(pdfId!, signal),
    enabled: Boolean(pdfId),
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    gcTime: VIEWER_BYTES_GC_TIME_MS,
  });
  const inViewer = useContext(FileViewerInformationHost) !== undefined;
  const facts = useContext(FileViewerFactsRegistry);
  const slot = useContext(WorkbenchTabListSlot);
  const ownFrame = !(framed ?? inViewer);
  const [chosen, setChosen] = useState<LatexPlace>();
  const [highlight, setHighlight] = useState<PdfHighlight>();
  // Unset until chosen: the tab opens on the PDF once there is one, else the source.
  const [view, setView] = useState<LatexView>();
  const [revealProblems, setRevealProblems] = useState(0);
  const [ownHost, setOwnHost] = useState<HTMLDivElement | null>(null);
  // The section mounts once; the width is observed once it exists.
  const [section, setSection] = useState<HTMLElement | null>(null);
  const sectionRef = useMemo(() => ({ current: section }), [section]);
  const wide = useContainerQuery(sectionRef, BOTH_MIN_WIDTH);
  const data = report.data;
  const fallback = !data && (!sessionId || report.isError) ? source : undefined;
  const texts = useMemo(
    () => data?.texts ?? (fallback ? { [fallback.name]: fallback.text } : NO_TEXTS),
    [data, fallback],
  );
  const entry = data ? entryFile(data) : (fallback?.name ?? '');
  // In a file's frame, a paper at the workspace root reads "paper › its file".
  useFileViewerTitle(entry.split('/').at(-1), 'paper');
  const file = chosen?.file ?? entry;
  const files = useMemo(
    () => (data ? data.files.filter((name) => /\.(tex|ltx|bib)$/iu.test(name)) : []),
    [data],
  );
  const problems = useMemo(() => (data ? latexProblems(data) : []), [data]);
  const rows = useMemo(() => latexOutlineRows(data?.outline?.nodes ?? []), [data]);
  const mode = view ?? latexDefaultView(Boolean(data?.build.pdf));
  // Side by side needs the width for both panes; narrower, the source shows instead.
  const shown: LatexView = !wide && mode === 'both' ? 'source' : mode;
  const building = Boolean(sessionId) && report.isFetching;
  // The report is built on request: fetching it again is the rebuild.
  const rebuild = sessionId ? () => void report.refetch() : undefined;
  const now = useSharedNow(Boolean(data) && !building, { periodMs: 30_000 });
  const fact = building
    ? 'building'
    : data
      ? builtAgo(report.dataUpdatedAt, now, data.build.status === 'failed' ? 'failed' : 'built')
      : fallback && sessionId
        ? 'not built'
        : '';

  const showPlace = (page: number, rect: number[]) => {
    const size = data?.page_sizes[page - 1];
    if (!size || rect.length !== 4) return;
    const [width, height] = size as [number, number];
    setHighlight({
      page: page - 1,
      rect: [rect[0]! / width, rect[1]! / height, rect[2]! / width, rect[3]! / height],
    });
  };
  // A place in the source: the PDF alone gives way to the source beside it.
  const goToSource = (place: LatexPlace) => {
    setChosen(place);
    setView(mode === 'pdf' ? 'both' : mode);
  };
  const sourceToPdf = async (line: number) => {
    setChosen({ file, line });
    if (!sessionId || !data) return;
    const found = await repository.latexLocate(artifactId, sessionId, { file, line });
    const place = found.places[0];
    if (place) showPlace(place.page, place.rect);
  };
  const pdfToSource = async (page: number, fx: number, fy: number) => {
    const size = data?.page_sizes[page];
    if (!size || !sessionId) return;
    const [width, height] = size as [number, number];
    const found = await repository.latexLocate(artifactId, sessionId, {
      page: page + 1,
      x: fx * width,
      y: fy * height,
    });
    if (found.status === 'complete' && found.file)
      goToSource({ file: found.file, line: found.line });
  };
  // A section shows where it is in whichever panes are open.
  const goToNode = (node: LatexOutlineNode) => {
    setChosen({ file: node.file, line: node.start_line });
    const place = node.places?.[0];
    if (place) showPlace(place.page, place.rect);
  };
  const goToProblem = (problem: LatexProblem) => {
    if (problem.file) goToSource({ file: problem.file, line: problem.line });
  };
  const picked = slot?.picked;
  const search = useWorkbenchListSearch('Search the outline');
  const shownRows = search.query
    ? rows.filter((row) => matchesListQuery(`${row.number} ${row.node.title ?? ''}`, search.query))
    : rows;
  const shownProblems = search.query
    ? problems.filter((problem) => matchesListQuery(problem.detail, search.query))
    : problems;

  const list = data ? (
    <LatexListSections
      entry={entry}
      filtered={Boolean(search.query.trim())}
      onProblem={(problem) => {
        goToProblem(problem);
        picked?.();
      }}
      onSection={(node) => {
        goToNode(node);
        picked?.();
      }}
      place={chosen}
      problems={shownProblems}
      revealProblems={revealProblems}
      rows={shownRows}
    />
  ) : null;
  const format = (
    <LatexFormat
      building={building}
      file={file}
      files={files}
      inWorkbench={Boolean(slot)}
      list={slot ? undefined : (list ?? undefined)}
      modes={latexModes(wide)}
      onFile={(name) => setChosen({ file: name })}
      onRebuild={rebuild}
      onShowProblems={() => {
        setRevealProblems((count) => count + 1);
        slot?.setShown(true);
      }}
      onView={setView}
      problems={problems}
      view={shown}
    />
  );

  const sourcePane = (
    <LatexSourcePane
      activeLine={chosen?.file === file ? chosen.line : undefined}
      diagnostics={data?.build.diagnostics ?? []}
      file={file}
      onLine={(line) => void sourceToPdf(line)}
      texts={texts}
    />
  );
  const pdfPane = data?.build.pdf ? (
    <CommentCapture className="h-full min-h-0" regionAnchor={pdfRegionAnchor}>
      <div className="h-full min-h-0 w-full">
        <ClioPdfPreview
          bytes={pdf.data}
          error={pdf.error?.message}
          fit="width"
          highlight={highlight}
          name={data.build.pdf.name}
          onPagePoint={(page, x, y) => void pdfToSource(page, x, y)}
        />
      </div>
    </CommentCapture>
  ) : data && (data.build.status === 'failed' || data.build.error) ? (
    <StateView
      action={rebuild ? { label: 'Rebuild', onClick: rebuild } : undefined}
      detail={data.build.error}
      kind="error"
      size="viewer"
      title="No PDF: the build stopped before making one"
    />
  ) : data || !sessionId ? (
    <StateView
      action={rebuild ? { label: 'Build', onClick: rebuild } : undefined}
      detail={sessionId ? undefined : 'Open this paper from a conversation to build it.'}
      kind="empty"
      size="viewer"
      title="Not built yet"
    />
  ) : (
    <StateView
      action={rebuild ? { label: 'Rebuild', onClick: rebuild } : undefined}
      detail={report.error?.message}
      kind="error"
      size="viewer"
      title="The paper could not be built"
    />
  );
  let body: ReactNode;
  if (sessionId && report.isPending)
    body = <StateView kind="loading" size="viewer" title="Building the paper…" />;
  else if (!data && !fallback)
    body = sessionId ? (
      <StateView
        action={{ label: 'Retry', onClick: () => void report.refetch() }}
        detail={report.error?.message}
        kind="error"
        size="viewer"
        title="The paper could not be built"
      />
    ) : (
      <StateView
        kind="unavailable"
        size="viewer"
        title="Open this paper from a conversation to build it."
      />
    );
  else
    body = (
      <>
        {/* Only the shown mode renders its panes: the PDF puts its own facts and
            controls in the frame bar, and a hidden copy would add a second set.
            The mode switch lives in the frame, so each pane names its own mode. */}
        <TabsContent {...paneName('pdf')} className={PANE} value="pdf">
          {pdfPane}
        </TabsContent>
        <TabsContent {...paneName('source')} className={PANE} value="source">
          {sourcePane}
        </TabsContent>
        <TabsContent
          {...paneName('both')}
          className={`${PANE} grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)]`}
          value="both"
        >
          <div className="min-h-0 min-w-0 border-r border-border">{sourcePane}</div>
          <div className="min-h-0 min-w-0">{pdfPane}</div>
        </TabsContent>
      </>
    );

  return (
    <section
      aria-label="LaTeX workspace"
      className="flex h-full min-h-0 min-w-0 flex-col"
      data-slot="latex-workspace"
      data-view={shown}
      ref={setSection}
    >
      {/* First, so the build's time leads the PDF's page among the frame's facts. */}
      {!ownFrame && facts ? <LatexFacts facts={fact ? [fact] : []} /> : null}
      <span className="sr-only" role="status">
        {building ? 'Building…' : ''}
      </span>
      <Tabs
        className="min-h-0 flex-1 gap-0"
        onValueChange={(next) => setView(next as LatexView)}
        value={shown}
      >
        <LatexFrame
          crumbs={data ? latexCrumbs(data.entry) : fallback ? latexCrumbs(fallback.name) : []}
          fact={fact}
          factInFormat={!ownFrame && !facts}
          format={format}
          onHost={setOwnHost}
          ownFrame={ownFrame}
        />
        {ownFrame ? (
          <ViewerToolbarHost.Provider value={ownHost}>{body}</ViewerToolbarHost.Provider>
        ) : (
          body
        )}
      </Tabs>
      {slot && list ? (
        <WorkbenchTabList actions={search.toggle} title="Outline">
          {search.withField(list)}
        </WorkbenchTabList>
      ) : null}
    </section>
  );
}

/**
 * A paper opened as a workspace file: once the file is an artifact version (a comment or the
 * agent's latex_build registered it), the LaTeX workspace; until then its source, with a way
 * to build it in the frame bar.
 */
export function LatexFileWorkspace({
  workspaceId,
  path,
  fallback,
}: {
  workspaceId: string;
  path: string;
  fallback: ReactNode;
}) {
  const { sessionId = '' } = useParams();
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  // The same query the file's comment layer reads, so both agree on the artifact.
  const target = useQuery({
    queryKey: queryKeys.key('comment-threads', settings.endpoint, 'target', workspaceId, path),
    queryFn: ({ signal }) => repository.commentTarget(workspaceId, path, signal),
    enabled: Boolean(sessionId),
    retry: false,
  });
  const register = useMutation({
    mutationFn: () => repository.createCommentTarget(workspaceId, { path, session_id: sessionId }),
    onError: (error) => toast.error('The paper could not be built', { description: error.message }),
  });
  const build = useRef<HTMLButtonElement>(null);
  const pending = register.isPending || target.isPending;
  // Narrowest, Build leaves the bar for a row in the frame's … menu, as the renderer's icons do.
  useFrameTool(
    build,
    sessionId ? { label: 'Build this paper', icon: <HammerIcon />, disabled: pending } : null,
  );
  const artifactId = register.data?.artifact_id ?? target.data?.artifact_id;
  if (sessionId && artifactId)
    return <LatexWorkspace artifactId={artifactId} sessionId={sessionId} />;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {sessionId ? (
        <ViewerToolbarContent>
          <Button
            className="h-7 px-2 text-[12px]"
            data-frame-tool=""
            disabled={pending}
            onClick={() => register.mutate()}
            ref={build}
            size="sm"
            variant="ghost"
          >
            Build this paper
          </Button>
        </ViewerToolbarContent>
      ) : null}
      <div className="min-h-0 flex-1">{fallback}</div>
    </div>
  );
}
