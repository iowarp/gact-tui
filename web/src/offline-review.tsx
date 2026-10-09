import { createRoot } from 'react-dom/client';
import { Component, useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ClioRepository,
  a2uiSurfaceSchema,
  type SessionReviewSnapshot,
  type Artifact,
  dashboardReportSchema,
  type DashboardReport,
} from '@clio/core/v3';
import { ArchiveConnectionProvider } from './providers/connection-provider';
import { RepositoryOverrideProvider } from './providers/repository-override';
import { ArchiveTransport } from './lib/session-export/archive-transport';
import { ArchiveFileList } from './lib/session-export/archive-file-list';
import { archiveFileHref } from './lib/session-export/archive-file-reference';
import { ArchiveEvidence } from './lib/session-export/archive-evidence';
import {
  type RecordedPart,
  type RecordedTool,
  type SavedToolOutput,
} from './lib/session-export/archive-timeline';
import { useA2uiSessionRegistry } from './lib/a2ui/processor-store';
import { A2uiReferenceSessionProvider } from './lib/a2ui/reference-session';
import { ClioA2UISurface } from './components/clio/a2ui-surface';
import './index.css';
import { setWorkerUrl } from 'maplibre-gl';
import { TooltipProvider } from './components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
import { vocab } from './lib/brand-vocabulary';
import {
  ArchiveConversation,
  type ArchiveTranscriptView,
} from './lib/session-export/archive-conversation';
import { ArtifactView, TextResourceView } from './components/clio/resource-viewers';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './components/ui/dialog';
import { DashboardView } from './components/clio/dashboard-view';

declare global {
  interface Window {
    CLIO_EXPORT_DATA?: string;
    CLIO_DASHBOARD_DATA?: string;
  }
}
setWorkerUrl(
  URL.createObjectURL(
    new Blob([import.meta.env.VITE_CLIO_ARCHIVE_MAP_WORKER], { type: 'text/javascript' }),
  ),
);
interface TranscriptRow {
  session: { id: string; title: string };
  messages: { id: string; role: string; created_at?: string; parts: RecordedPart[] }[];
  tool_records: RecordedTool[];
  loaded_skills: { event_id: string; skill_id?: string; file?: string; content?: string }[];
  recording: unknown;
}
interface ArchiveData {
  transcript_views: Record<string, ArchiveTranscriptView>;
  transcript: TranscriptRow & { children: TranscriptRow[]; exported_at: string };
  manifest: {
    mode: string;
    omissions: unknown[];
    files: { archive_path: string; bytes: number; source_path?: string }[];
    artifacts: { artifact_id: string; name: string; archive_path?: string | null; path?: string }[];
    workspace_folders?: { source_path: string; archive_path: string }[];
    tool_output_files?: SavedToolOutput[];
  };
  snapshot: SessionReviewSnapshot & { tool_output_text?: Record<string, string> };
}
let data: ArchiveData;
let rows: TranscriptRow[];
let ids: string[];

export function SavedView({ value }: { value: unknown }) {
  const result = a2uiSurfaceSchema.safeParse(value);
  if (!result.success)
    return (
      <p className="rounded-lg border p-4">
        This saved view could not be decoded. Its exact record remains in Evidence.
      </p>
    );
  return (
    <section className="my-5">
      <ClioA2UISurface
        surface={result.data}
        readOnly
        onRemoteAction={async () => {
          throw new Error('This archive is read-only. Open a live session to ask the agent.');
        }}
      />
    </section>
  );
}
function sourceLink(uri: string | undefined, references: RecordedPart[] = []): string | undefined {
  if (!uri) return undefined;
  if (!uri.startsWith('artifact://')) {
    if (/^https?:\/\//.test(uri) || uri.startsWith('mailto:') || uri.startsWith('#')) return uri;
    const matches = [
      ...new Set(
        references
          .filter((part) => part.type === 'resource_link' && part.name === uri)
          .map((part) => part.uri)
          .filter((value): value is string => !!value),
      ),
    ];
    if (matches.length === 1) return sourceLink(matches[0]);
    return archiveFileHref(uri, data.manifest);
  }
  return archiveFileHref(uri, data.manifest);
}
export function Review() {
  useA2uiSessionRegistry(ids);
  const [opened, setOpened] = useState<Artifact | string>();
  const [section, setSection] = useState(
    location.hash === '#evidence'
      ? 'evidence'
      : location.hash === '#included-files' && data.manifest.mode !== 'transcript'
        ? 'files'
        : location.hash === '#results'
          ? 'results'
          : 'conversation',
  );
  useEffect(() => {
    const fallback = document.getElementById('archive-document');
    if (fallback) fallback.hidden = true;
    document.getElementById('root')!.hidden = false;
  }, []);
  const tools = rows.reduce((count, row) => count + row.tool_records.length, 0);
  const skills = rows.reduce((count, row) => count + row.loaded_skills.length, 0);
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6 text-foreground">
      <header className="border-b pb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {vocab.product} · Session archive
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          {data.transcript.session.title}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {data.manifest.mode[0].toUpperCase() + data.manifest.mode.slice(1)} ·{' '}
          {rows.reduce((n, row) => n + row.messages.length, 0)} messages · {tools} tool records ·{' '}
          {skills} skill loads
        </p>
        <p className="mt-3 text-sm">
          Read the conversation and work in order. Saved views support local inspection; asking the
          agent requires a live session.
        </p>
      </header>
      {(data.snapshot.failures.length > 0 || data.manifest.omissions.length > 0) && (
        <p className="rounded-lg bg-muted p-3 text-sm">
          Some dependencies or workspace folders were unavailable or excluded. See{' '}
          <button className="underline" onClick={() => setSection('evidence')}>
            Evidence and coverage
          </button>
          .
        </p>
      )}
      <Tabs
        value={section}
        onValueChange={(value) => {
          setSection(value);
          history.replaceState(null, '', value === 'files' ? '#included-files' : `#${value}`);
        }}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <TabsList className="h-10">
            <TabsTrigger className="px-4" value="conversation">
              Conversation & activity
            </TabsTrigger>
            <TabsTrigger className="px-4" value="results">
              Results
            </TabsTrigger>
            {data.manifest.mode !== 'transcript' && (
              <TabsTrigger className="px-4" value="files">
                Files
              </TabsTrigger>
            )}
            <TabsTrigger className="px-4" value="evidence">
              Evidence & skills
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="conversation">
          {rows.map((row) => (
            <ArchiveConversation
              key={row.session.id}
              sessionId={row.session.id}
              view={data.transcript_views[row.session.id]}
              snapshot={data.snapshot}
              onOpenArtifact={setOpened}
              onOpenFile={setOpened}
            />
          ))}
        </TabsContent>
        <TabsContent value="results">
          <h2 className="mb-3 text-2xl font-semibold">Saved results</h2>
          {rows.map((row) => (
            <A2uiReferenceSessionProvider key={row.session.id} value={row.session.id}>
              {(data.snapshot.sessions[row.session.id] ?? []).map((view, i) => (
                <SavedView key={i} value={view} />
              ))}
            </A2uiReferenceSessionProvider>
          ))}
          {!Object.values(data.snapshot.sessions).some((views) => views.length) && (
            <p>
              No interactive views were recorded. Images and file references remain in the
              conversation.
            </p>
          )}
        </TabsContent>
        <TabsContent value="files" id="included-files">
          <h2 className="text-2xl font-semibold">Included files</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Transcript contains the recorded work. Effects adds touched artifacts and inputs. Full
            also includes the workspace snapshot.
          </p>
          <ArchiveFileList files={data.manifest.files} />
        </TabsContent>
        <TabsContent value="evidence">
          <ArchiveEvidence
            rows={rows}
            transcript={data.transcript}
            omissions={data.manifest.omissions}
          />
        </TabsContent>
      </Tabs>
      <Dialog
        open={opened !== undefined}
        onOpenChange={(open) => {
          if (!open) setOpened(undefined);
        }}
      >
        <DialogContent className="flex h-[85dvh] max-w-[95vw] flex-col sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {typeof opened === 'string' ? opened.split(/[\\/]/).at(-1) : opened?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto">
            {typeof opened === 'string' ? (
              data.snapshot.tool_output_text?.[opened] !== undefined ? (
                <TextResourceView path={opened} content={data.snapshot.tool_output_text[opened]} />
              ) : (
                <p className="p-4">
                  {sourceLink(opened) ? (
                    <a className="underline" href={sourceLink(opened)}>
                      Open included file
                    </a>
                  ) : (
                    'This source file was not included. Choose Effects or Full to include recorded inputs and artifacts.'
                  )}
                </p>
              )
            ) : opened ? (
              <>
                {sourceLink(`artifact://${opened.id}`) && (
                  <p className="p-3 text-sm">
                    <a className="underline" href={sourceLink(`artifact://${opened.id}`)}>
                      Open included source file: {opened.name}
                    </a>
                  </p>
                )}
                {data.snapshot.responses[
                  `GET ${opened.fetch_path || `/v1/artifacts/${opened.id}/bytes`}`
                ] ? (
                  <ArtifactView
                    artifact={opened}
                    workspaceId={opened.workspace_id ?? ''}
                    files={[]}
                  />
                ) : (
                  <p className="p-3 text-sm">
                    This file has no embedded preview. Effects and Full include recorded artifacts
                    as separate files; use the source-file link above when available.
                  </p>
                )}
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      <footer className="border-t pt-5 text-xs text-muted-foreground">
        Exported {new Date(data.transcript.exported_at).toLocaleString()} ·{' '}
        {data.manifest.mode === 'transcript' ? (
          <button className="underline" onClick={() => setSection('evidence')}>
            Embedded transcript and skills
          </button>
        ) : (
          <>
            <a className="underline" href="transcript.json">
              Raw transcript
            </a>{' '}
            ·{' '}
            <a className="underline" href="manifest.json">
              File inventory and checksums
            </a>
          </>
        )}
      </footer>
    </main>
  );
}
function showFallback(error: unknown): void {
  const root = document.getElementById('root');
  const fallback = document.getElementById('archive-document');
  if (root && fallback) {
    root.hidden = true;
    fallback.hidden = false;
  }
  const status = document.getElementById('archive-status');
  if (status) {
    status.className = 'notice';
    status.textContent = `Interactive views could not start (${error instanceof Error ? error.message : String(error)}). The conversation, tool activity and saved evidence remain readable below.`;
  }
}
class ReviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    showFallback(error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
function OfflineDashboard({ report }: { report: DashboardReport }) {
  useA2uiSessionRegistry([report.session_id]);
  useEffect(() => {
    document.getElementById('archive-document')!.hidden = true;
    document.getElementById('root')!.hidden = false;
  }, []);
  return (
    <main className="mx-auto max-w-7xl">
      <DashboardView report={report} offline />
    </main>
  );
}

async function mountReview(): Promise<void> {
  const encoded = window.CLIO_DASHBOARD_DATA ?? window.CLIO_EXPORT_DATA;
  const decoded = encoded
    ? await new Response(
        new Blob([Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))])
          .stream()
          .pipeThrough(new DecompressionStream('gzip')),
      ).text()
    : document.getElementById('clio-export-data')?.textContent;
  if (!decoded) throw new Error('The archive review data is missing.');
  const decodedData = JSON.parse(decoded);
  const dashboard = window.CLIO_DASHBOARD_DATA
    ? {
        report: dashboardReportSchema.parse(decodedData.report),
        snapshot: decodedData.snapshot as SessionReviewSnapshot,
      }
    : undefined;
  if (!dashboard) {
    data = decodedData as ArchiveData;
    rows = [data.transcript, ...data.transcript.children];
    ids = rows.map((row) => row.session.id);
  }
  const repository = new ClioRepository(new ArchiveTransport(dashboard?.snapshot ?? data.snapshot));
  document.documentElement.classList.remove('dark');
  createRoot(document.getElementById('root')!).render(
    <ReviewBoundary>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ArchiveConnectionProvider>
          <RepositoryOverrideProvider repository={repository}>
            <TooltipProvider>
              {dashboard ? <OfflineDashboard report={dashboard.report} /> : <Review />}
            </TooltipProvider>
          </RepositoryOverrideProvider>
        </ArchiveConnectionProvider>
      </QueryClientProvider>
    </ReviewBoundary>,
  );
}
void mountReview().catch(showFallback);
