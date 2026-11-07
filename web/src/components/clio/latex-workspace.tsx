import { useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { ChevronLeftIcon, ChevronRightIcon, ListTreeIcon, ScrollTextIcon } from 'lucide-react';
import type { LatexOutlineNode, LatexReport } from '@clio/core/v3';
import { queryKeys } from '@/lib/query-keys';
import { useContainerQuery } from '@/hooks/use-container-query';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { RefreshIcon } from '@/lib/icon-vocabulary';
import { CommentCapture } from './comments/comment-capture';
import { useCommentSession } from './comments/comment-session';
import { pdfRegionAnchor } from './comments/region-anchors';
import type { PdfHighlight } from './document-pdf-viewer';
import { LatexSourcePane } from './latex-source-pane';
import { LATEX_WARNING_KINDS, latexKindLabel } from '@/lib/latex-diagnostics';
import { ClioPdfPreview } from './pdf-preview';
import { ResourceLoading, ResourceUnavailable } from './resource-states';
import { ClioStatus } from './status';

/** Which panes the wide layout shows: the source and the PDF side by side, or one of them. */
type PaneView = 'both' | 'source' | 'pdf';

const VIEW_LABELS: Record<PaneView, string> = {
  both: 'Source and PDF',
  source: 'Source',
  pdf: 'PDF',
};

/**
 * The strip between the source and the PDF. Its arrows push it aside: left hides the source,
 * right hides the PDF; at an edge, its one arrow brings the hidden pane back.
 */
function PaneDivider({ view, onView }: { view: PaneView; onView: (view: PaneView) => void }) {
  const arrow = (to: PaneView, label: string, left: boolean) => (
    <Button
      aria-label={label}
      className="h-10 w-3.5 rounded-sm border bg-muted px-0 text-foreground hover:bg-accent"
      onClick={() => onView(to)}
      size="sm"
      title={label}
      variant="ghost"
    >
      {left ? <ChevronLeftIcon aria-hidden="true" /> : <ChevronRightIcon aria-hidden="true" />}
    </Button>
  );
  return (
    <div
      className="flex min-h-0 w-4 flex-col items-center justify-center gap-2 border-x bg-muted/40"
      data-slot="latex-pane-divider"
    >
      {view !== 'pdf' ? null : arrow('both', 'Show the source beside the PDF', false)}
      {view === 'both' ? arrow('pdf', 'Hide the source', true) : null}
      {view === 'both' ? arrow('source', 'Hide the PDF', false) : null}
      {view !== 'source' ? null : arrow('both', 'Show the PDF beside the source', true)}
    </div>
  );
}

interface Place {
  file: string;
  line?: number;
}

function entryFile(report: LatexReport): string {
  const prefix = report.folder ? `${report.folder}/` : '';
  return report.entry.startsWith(prefix) ? report.entry.slice(prefix.length) : report.entry;
}

/** The build's errors (failing problems, failed venue checks) and warnings, counted. */
function problemCounts(report: LatexReport): { errors: number; warnings: number } {
  const build = report.build;
  const checks = build.venue?.checks ?? [];
  const failing = build.diagnostics.filter((item) => !LATEX_WARNING_KINDS.has(item.kind)).length;
  return {
    errors: failing + checks.filter((check) => check.status === 'failed').length,
    warnings:
      build.diagnostics.length -
      failing +
      checks.filter((check) => check.status !== 'failed' && check.status !== 'passed').length,
  };
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** A count in a small bubble: red for errors, yellow for warnings; the button says it in words. */
function CountBubble({ count, tone }: { count: number; tone: 'error' | 'warning' }) {
  if (!count) return null;
  return (
    <span
      aria-hidden="true"
      className={
        tone === 'error'
          ? 'min-w-4 rounded-full bg-destructive px-1 text-[10px] leading-4 font-medium text-destructive-foreground tabular-nums'
          : 'min-w-4 rounded-full bg-warning px-1 text-[10px] leading-4 font-medium text-warning-foreground tabular-nums'
      }
    >
      {count}
    </span>
  );
}

/** The build log: one button with its error and warning counts; the list opens on click. */
function BuildSummary({ report, onGo }: { report: LatexReport; onGo: (place: Place) => void }) {
  const build = report.build;
  const failed = build.status === 'failed';
  const { errors, warnings } = problemCounts(report);
  const label = `Build log: ${
    errors || warnings
      ? [errors ? plural(errors, 'error') : '', warnings ? plural(warnings, 'warning') : '']
          .filter(Boolean)
          .join(', ')
      : 'no problems'
  }`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button aria-label={label} className="gap-1 px-1.5" size="sm" title={label} variant="ghost">
          <ScrollTextIcon aria-hidden="true" />
          <CountBubble count={errors} tone="error" />
          <CountBubble count={warnings} tone="warning" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[90vw]">
        <PopoverHeader>
          <PopoverTitle>{failed ? 'The build has problems' : 'The paper built'}</PopoverTitle>
          {build.network && !build.network.startsWith('bundle_hosts') ? (
            <PopoverDescription>Network: {build.network}</PopoverDescription>
          ) : null}
        </PopoverHeader>
        <ul className="mt-2 max-h-72 space-y-1 overflow-auto text-sm" aria-label="Build problems">
          {build.diagnostics.map((item, index) => (
            <li key={index}>
              <button
                className="w-full rounded px-1 py-0.5 text-left hover:bg-muted disabled:cursor-default"
                disabled={!item.file}
                onClick={() => onGo({ file: item.file, line: item.line || undefined })}
                type="button"
              >
                <span className="font-medium">{latexKindLabel(item.kind)}</span>
                {item.file ? (
                  <span className="font-mono text-xs text-muted-foreground">
                    {' '}
                    {item.file}
                    {item.line ? `:${item.line}` : ''}
                  </span>
                ) : null}
                <span className="block text-xs text-muted-foreground">{item.message}</span>
              </button>
            </li>
          ))}
          {build.venue?.checks.map((check, index) => (
            <li key={`venue-${index}`}>
              {/* A check that names a place (an author's name in a section) opens it, as a problem does. */}
              <button
                className="w-full rounded px-1 py-0.5 text-left hover:bg-muted disabled:cursor-default"
                disabled={!check.file}
                onClick={() => onGo({ file: check.file, line: check.line || undefined })}
                type="button"
              >
                <ClioStatus
                  compact
                  value={
                    check.status === 'failed'
                      ? 'failed'
                      : check.status === 'passed'
                        ? 'completed'
                        : 'degraded'
                  }
                />{' '}
                <span className="font-medium">{check.rule}</span>
                {check.file ? (
                  <span className="font-mono text-xs text-muted-foreground">
                    {' '}
                    {check.file}
                    {check.line ? `:${check.line}` : ''}
                  </span>
                ) : null}
                <span className="block text-xs text-muted-foreground">{check.message}</span>
              </button>
            </li>
          ))}
          {!build.diagnostics.length && !build.venue ? (
            <li className="text-muted-foreground">No problems.</li>
          ) : null}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function OutlineNav({
  nodes,
  onGo,
}: {
  nodes: LatexOutlineNode[];
  onGo: (node: LatexOutlineNode) => void;
}) {
  const rows: { node: LatexOutlineNode; depth: number }[] = [];
  const visit = (list: LatexOutlineNode[] | undefined, depth: number) => {
    for (const node of list ?? []) {
      rows.push({ node, depth });
      visit(node.children, depth + 1);
    }
  };
  visit(nodes, 0);
  if (!rows.length) return <p className="p-3 text-sm text-muted-foreground">No sections yet.</p>;
  return (
    <nav aria-label="Paper outline" className="h-full overflow-auto py-1 text-sm">
      <ul>
        {rows.map(({ node, depth }, index) => {
          const name = node.title || node.labels?.[0];
          return (
            <li key={index}>
              <button
                className="w-full truncate rounded px-2 py-0.5 text-left hover:bg-muted"
                onClick={() => onGo(node)}
                style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
                title={`${node.file}:${node.start_line}`}
                type="button"
              >
                {name && node.kind !== 'section' ? (
                  <span className="text-xs text-muted-foreground">{node.kind} </span>
                ) : null}
                {name || node.kind.charAt(0).toUpperCase() + node.kind.slice(1)}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The LaTeX workspace (LaTeX plan): source with its build problems in the gutter beside the
 * compiled PDF, click-through both ways (click a source line; double-click the PDF), an
 * outline navigator, and the comment layer on both panes. The server builds, maps and checks;
 * the last successful build stays visible while a new one runs.
 */
export function LatexWorkspace({
  artifactId,
  sessionId,
}: {
  artifactId: string;
  sessionId: string;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const session = useCommentSession();
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
  });
  const [chosen, setChosen] = useState<Place>();
  const [highlight, setHighlight] = useState<PdfHighlight>();
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [narrowTab, setNarrowTab] = useState('source');
  const [view, setView] = useState<PaneView>('both');
  // The section mounts after loading; the width is observed once it exists.
  const [section, setSection] = useState<HTMLElement | null>(null);
  const sectionRef = useMemo(() => ({ current: section }), [section]);
  const wide = useContainerQuery(sectionRef, 720);
  const data = report.data;
  const file = chosen?.file ?? (data ? entryFile(data) : '');
  const files = useMemo(
    () => (data ? data.files.filter((name) => /\.(tex|ltx|bib)$/iu.test(name)) : []),
    [data],
  );

  const showPlace = (page: number, rect: number[]) => {
    const size = data?.page_sizes[page - 1];
    if (!size || rect.length !== 4) return;
    const [width, height] = size as [number, number];
    setHighlight({
      page: page - 1,
      rect: [rect[0]! / width, rect[1]! / height, rect[2]! / width, rect[3]! / height],
    });
  };
  const goToSource = (place: Place) => {
    setChosen(place);
    setNarrowTab('source');
  };
  const sourceToPdf = async (line: number) => {
    setChosen({ file, line });
    if (!sessionId) return;
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
    if (found.status === 'complete' && found.file) {
      goToSource({ file: found.file, line: found.line });
      setView((current) => (current === 'pdf' ? 'both' : current));
    }
  };
  const goToNode = (node: LatexOutlineNode) => {
    goToSource({ file: node.file, line: node.start_line });
    const place = node.places?.[0];
    if (place) showPlace(place.page, place.rect);
  };

  if (!sessionId)
    return <ResourceUnavailable label="Open this paper from a conversation to build it." />;
  if (report.isPending) return <ResourceLoading className="p-4" label="Building the paper…" />;
  if (report.isError || !data)
    return (
      <ResourceUnavailable detail={report.error?.message} label="The paper could not be built" />
    );

  const sourcePane = (
    <LatexSourcePane
      activeLine={chosen?.file === file ? chosen.line : undefined}
      diagnostics={data.build.diagnostics}
      file={file}
      files={files}
      onFile={(name) => setChosen({ file: name })}
      onLine={(line) => void sourceToPdf(line)}
      texts={data.texts}
    />
  );
  const pdfPane = data.build.pdf ? (
    <CommentCapture className="h-full min-h-0" regionAnchor={pdfRegionAnchor}>
      <div className="h-full min-h-0 w-full">
        <ClioPdfPreview
          bytes={pdf.data}
          error={pdf.error?.message}
          fit="width"
          highlight={highlight}
          name={data.build.pdf.name}
          onPagePoint={(page, x, y) => void pdfToSource(page, x, y)}
          onSelection={(anchor) => {
            if (session?.active && session.mode === 'text') session.addMark(anchor);
          }}
        />
      </div>
    </CommentCapture>
  ) : (
    <ResourceUnavailable
      detail={data.build.error}
      label="No PDF: the build stopped before making one"
    />
  );
  const outline = <OutlineNav nodes={data.outline?.nodes ?? []} onGo={goToNode} />;

  return (
    <section
      aria-label="LaTeX workspace"
      className="@container/latex flex h-full min-h-0 min-w-0 flex-col"
      data-slot="latex-workspace"
      ref={setSection}
    >
      {/* Right-aligned: the comment controls of a workspace file sit at the top left. */}
      <div className="flex min-h-11 shrink-0 items-center justify-end gap-1 border-b px-2 py-1">
        {report.isFetching ? (
          <span className="text-xs text-muted-foreground" role="status">
            Building…
          </span>
        ) : null}
        <ToggleGroup
          aria-label="Panes"
          className="hidden @[720px]/latex:flex"
          onValueChange={(value) => {
            if (value) setView(value as PaneView);
          }}
          size="sm"
          spacing={0}
          type="single"
          value={view}
          variant="outline"
        >
          {(Object.keys(VIEW_LABELS) as PaneView[]).map((value) => (
            <ToggleGroupItem className="px-2 text-xs" key={value} value={value}>
              {VIEW_LABELS[value]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <span
          aria-hidden="true"
          className="mx-0.5 hidden h-5 w-px bg-border @[720px]/latex:block"
        />
        <BuildSummary
          onGo={(place) => {
            goToSource(place);
            setView((current) => (current === 'pdf' ? 'both' : current));
          }}
          report={data}
        />
        <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border" />
        <Button
          aria-label="Rebuild the paper"
          onClick={() => void report.refetch()}
          size="icon-sm"
          title="Rebuild the paper"
          variant="ghost"
        >
          <RefreshIcon aria-hidden="true" />
        </Button>
        <Button
          aria-label={outlineOpen ? 'Hide the outline' : 'Show the outline'}
          aria-pressed={outlineOpen}
          className="hidden @[720px]/latex:inline-flex"
          onClick={() => setOutlineOpen((value) => !value)}
          size="icon-sm"
          title="Outline"
          variant="ghost"
        >
          <ListTreeIcon aria-hidden="true" />
        </Button>
      </div>
      {/* Wide: outline, source and PDF side by side. Narrow: one at a time. */}
      <div
        className="hidden min-h-0 flex-1 @[720px]/latex:grid"
        data-view={view}
        style={{
          gridTemplateColumns: [
            outlineOpen ? '13rem' : '',
            view === 'pdf' ? '' : 'minmax(0,1fr)',
            'auto',
            view === 'source' ? '' : 'minmax(0,1fr)',
          ]
            .filter(Boolean)
            .join(' '),
        }}
      >
        {/* Only the layout that shows renders its panes: each viewer puts its own controls
            (zoom) in the shared toolbar, and a hidden copy would add a second set. */}
        {wide && outlineOpen ? <div className="min-h-0 border-r">{outline}</div> : null}
        {wide && view !== 'pdf' ? <div className="min-h-0 min-w-0">{sourcePane}</div> : null}
        <PaneDivider onView={setView} view={view} />
        {wide && view !== 'source' ? <div className="min-h-0 min-w-0">{pdfPane}</div> : null}
      </div>
      <Tabs
        className="flex min-h-0 flex-1 flex-col @[720px]/latex:hidden"
        onValueChange={setNarrowTab}
        value={narrowTab}
      >
        <TabsList className="mx-2 mt-1 shrink-0">
          <TabsTrigger value="source">Source</TabsTrigger>
          <TabsTrigger value="pdf">PDF</TabsTrigger>
          <TabsTrigger value="outline">Outline</TabsTrigger>
        </TabsList>
        <TabsContent className="m-0 min-h-0 flex-1" value="source">
          {wide ? null : sourcePane}
        </TabsContent>
        <TabsContent className="m-0 min-h-0 flex-1" value="pdf">
          {wide ? null : pdfPane}
        </TabsContent>
        <TabsContent className="m-0 min-h-0 flex-1" value="outline">
          {wide ? null : outline}
        </TabsContent>
      </Tabs>
    </section>
  );
}

/**
 * A paper opened as a workspace file: once the file is an artifact version (a comment or the
 * agent's latex_build registered it), the LaTeX workspace; until then its source, with a way
 * to build it.
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
  });
  const artifactId = register.data?.artifact_id ?? target.data?.artifact_id;
  if (sessionId && artifactId)
    return <LatexWorkspace artifactId={artifactId} sessionId={sessionId} />;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {sessionId ? (
        <div className="flex shrink-0 items-center gap-2 border-b px-2 py-1">
          <Button
            disabled={register.isPending || target.isPending}
            onClick={() => register.mutate()}
            size="sm"
            variant="secondary"
          >
            Build this paper
          </Button>
          {register.error ? (
            <span className="text-xs text-destructive" role="alert">
              {register.error.message}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="min-h-0 flex-1">{fallback}</div>
    </div>
  );
}
