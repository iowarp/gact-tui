import { createRoot } from 'react-dom/client';
import { Component, useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClioRepository, a2uiSurfaceSchema, type SessionReviewSnapshot } from '@clio/core/v3';
import { ArchiveConnectionProvider } from './providers/connection-provider';
import { RepositoryOverrideProvider } from './providers/repository-override';
import { ArchiveTransport } from './lib/session-export/archive-transport';
import { ArchiveFileList } from './lib/session-export/archive-file-list';
import { ArchiveEvidence } from './lib/session-export/archive-evidence';
import {
  RecordedActivity,
  type RecordedPart,
  type RecordedTool,
  type SavedToolOutput,
} from './lib/session-export/archive-timeline';
import { useA2uiSessionRegistry } from './lib/a2ui/processor-store';
import { A2uiReferenceSessionProvider } from './lib/a2ui/reference-session';
import { ClioA2UISurface } from './components/clio/a2ui-surface';
import { GroundedMessageResponse } from './components/clio/grounded-message-response';
import { A2uiMedia } from './components/clio/a2ui-media';
import { ARTIFACT_IMAGE_PATH } from './lib/remark-artifact-images';
import './index.css';
import { setWorkerUrl } from 'maplibre-gl';
import { TooltipProvider } from './components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
import { vocab } from './lib/brand-vocabulary';

declare global {
  interface Window {
    CLIO_EXPORT_DATA?: string;
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
  transcript: TranscriptRow & { children: TranscriptRow[]; exported_at: string };
  manifest: {
    mode: string;
    omissions: unknown[];
    files: { archive_path: string; bytes: number }[];
    artifacts: { artifact_id: string; name: string; archive_path?: string | null }[];
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
    return data.manifest.files.some((file) => file.archive_path === uri)
      ? uri.split('/').map(encodeURIComponent).join('/')
      : undefined;
  }
  const id = uri.slice('artifact://'.length).split('/')[0];
  const path = data.manifest.artifacts.find((item) => item.artifact_id === id)?.archive_path;
  return path?.split('/').map(encodeURIComponent).join('/');
}
function RecordedText({
  text,
  identity,
  references,
}: {
  text: string;
  identity: string;
  references: RecordedPart[];
}) {
  return (
    <GroundedMessageResponse
      components={{
        a: ({ href, children }) => {
          const target = sourceLink(href, references);
          return target ? (
            <a href={target} className="underline">
              {children}
            </a>
          ) : (
            <span>{children} (source file requires Effects or Full)</span>
          );
        },
        img: ({ src, alt }) =>
          typeof src === 'string' && src.startsWith(ARTIFACT_IMAGE_PATH) ? (
            <A2uiMedia
              componentId={identity}
              kind="image"
              url={decodeURIComponent(src.slice(ARTIFACT_IMAGE_PATH.length))}
              label={alt}
              objectFit="contain"
            />
          ) : (
            <span>Uncaptured image: {alt}</span>
          ),
      }}
    >
      {text}
    </GroundedMessageResponse>
  );
}
function Conversation({ row }: { row: TranscriptRow }) {
  const surfaces = data.snapshot.sessions[row.session.id] ?? [];
  return (
    <A2uiReferenceSessionProvider value={row.session.id}>
      <section id={row.session.id} className="space-y-6">
        {rows.length > 1 && <h2 className="text-2xl font-semibold">{row.session.title}</h2>}
        {row.messages.map((message) => {
          const views = surfaces.filter(
            (value) => (value as { message_id?: string }).message_id === message.id,
          );
          const firstView = message.parts.findIndex((part) => part.type === 'a2ui');
          return (
            <article
              key={message.id}
              className={`rounded-xl border p-5 ${message.role === 'user' ? 'bg-primary/5' : 'bg-background'}`}
            >
              <div className="mb-4 flex items-center justify-between gap-4">
                <h3 className="text-sm font-semibold">
                  {message.role === 'user'
                    ? 'You'
                    : message.role === 'assistant'
                      ? vocab.product
                      : message.role}
                </h3>
                {message.created_at && (
                  <time className="text-xs text-muted-foreground" dateTime={message.created_at}>
                    {new Date(message.created_at).toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                )}
              </div>
              {message.parts.map((part, i) => {
                const key = part.id ?? `${message.id}-${i}`;
                if (part.type === 'text')
                  return (
                    <div className="my-4" key={key}>
                      <RecordedText
                        text={part.text ?? ''}
                        identity={key}
                        references={message.parts}
                      />
                    </div>
                  );
                if (['thinking', 'injection', 'tool_call', 'tool_result'].includes(part.type))
                  return (
                    <RecordedActivity
                      key={key}
                      part={part}
                      tools={row.tool_records}
                      outputs={data.manifest.tool_output_files?.map((item) => ({
                        ...item,
                        text: data.snapshot.tool_output_text?.[item.source_path],
                        embedded: data.manifest.mode === 'transcript',
                      }))}
                    />
                  );
                if (part.type === 'image' && part.url)
                  return (
                    <A2uiMedia
                      key={key}
                      componentId={key}
                      kind="image"
                      url={part.url}
                      objectFit="contain"
                    />
                  );
                if (part.type === 'resource_link') {
                  const target = sourceLink(part.uri);
                  return (
                    <p className="my-2 text-sm" key={key}>
                      {target ? (
                        <a className="underline" href={target}>
                          {part.name || 'Recorded file'}
                        </a>
                      ) : (
                        <span>
                          {part.name || 'Recorded file'} · source file requires Effects or Full
                        </span>
                      )}
                    </p>
                  );
                }
                if (part.type === 'a2ui')
                  return i === firstView ? (
                    <div key={key}>
                      {views.map((view, j) => (
                        <SavedView key={j} value={view} />
                      ))}
                    </div>
                  ) : null;
                return (
                  <p className="my-3 text-sm text-muted-foreground" key={key}>
                    Recorded {part.type.replaceAll('_', ' ')} · exact record in Evidence.
                  </p>
                );
              })}
              {firstView < 0 && views.map((view, i) => <SavedView key={i} value={view} />)}
              {!message.parts.length && (
                <p className="text-sm text-muted-foreground">
                  No visible content was recorded for this message.
                </p>
              )}
            </article>
          );
        })}
        {surfaces
          .filter(
            (value) =>
              !row.messages.some(
                (message) => message.id === (value as { message_id?: string }).message_id,
              ),
          )
          .map((view, i) => (
            <SavedView key={i} value={view} />
          ))}
      </section>
    </A2uiReferenceSessionProvider>
  );
}
export function Review() {
  useA2uiSessionRegistry(ids);
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
            <Conversation key={row.session.id} row={row} />
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
async function mountReview(): Promise<void> {
  const encoded = window.CLIO_EXPORT_DATA;
  const decoded = encoded
    ? await new Response(
        new Blob([Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))])
          .stream()
          .pipeThrough(new DecompressionStream('gzip')),
      ).text()
    : document.getElementById('clio-export-data')?.textContent;
  if (!decoded) throw new Error('The archive review data is missing.');
  data = JSON.parse(decoded) as ArchiveData;
  const repository = new ClioRepository(new ArchiveTransport(data.snapshot));
  rows = [data.transcript, ...data.transcript.children];
  ids = rows.map((row) => row.session.id);
  document.documentElement.classList.remove('dark');
  createRoot(document.getElementById('root')!).render(
    <ReviewBoundary>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ArchiveConnectionProvider>
          <RepositoryOverrideProvider repository={repository}>
            <TooltipProvider>
              <Review />
            </TooltipProvider>
          </RepositoryOverrideProvider>
        </ArchiveConnectionProvider>
      </QueryClientProvider>
    </ReviewBoundary>,
  );
}
void mountReview().catch(showFallback);
