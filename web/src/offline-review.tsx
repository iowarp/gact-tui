import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClioRepository, a2uiSurfaceSchema, type SessionReviewSnapshot } from '@clio/core/v3';
import { ArchiveConnectionProvider } from './providers/connection-provider';
import { RepositoryOverrideProvider } from './providers/repository-override';
import { ArchiveTransport } from './lib/session-export/archive-transport';
import { ArchiveFileList } from './lib/session-export/archive-file-list';
import { useA2uiSessionRegistry } from './lib/a2ui/processor-store';
import { A2uiReferenceSessionProvider } from './lib/a2ui/reference-session';
import { ClioA2UISurface } from './components/clio/a2ui-surface';
import { GroundedMessageResponse } from './components/clio/grounded-message-response';
import { A2uiMedia } from './components/clio/a2ui-media';
import { ARTIFACT_IMAGE_PATH } from './lib/remark-artifact-images';
import './index.css';
import { setWorkerUrl } from 'maplibre-gl';
import { TooltipProvider } from './components/ui/tooltip';
import { vocab } from './lib/brand-vocabulary';

declare global {
  interface Window {
    CLIO_EXPORT_DATA?: string;
  }
}

// Official MapLibre worker, bundled into this script and spawned from local bytes.
setWorkerUrl(
  URL.createObjectURL(
    new Blob([import.meta.env.VITE_CLIO_ARCHIVE_MAP_WORKER], { type: 'text/javascript' }),
  ),
);

interface TranscriptRow {
  session: { id: string; title: string };
  messages: { id: string; role: string; parts: { type: string; text?: string; url?: string }[] }[];
  tool_records: { call_id: string; tool?: string }[];
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
  };
  snapshot: SessionReviewSnapshot;
}
let data: ArchiveData;
let repository: ClioRepository;
let rows: TranscriptRow[];
let ids: string[];

export function Details({ title, value }: { title: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="my-2 rounded-lg border p-3"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer font-medium">{title}</summary>
      {open && (
        <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words text-xs">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </details>
  );
}

function RecordedSkill({ skill }: { skill: TranscriptRow['loaded_skills'][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="my-2 rounded-lg border p-3"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer font-medium">
        {skill.skill_id ?? 'Skill'} · {skill.file ?? 'procedure'}
      </summary>
      {open && (
        <div className="mt-4 space-y-4">
          {skill.content ? (
            <GroundedMessageResponse>{skill.content}</GroundedMessageResponse>
          ) : (
            <p>The procedure body was not recorded for this historical load.</p>
          )}
          <Details title="Exact skill load record" value={skill} />
        </div>
      )}
    </details>
  );
}

export function SavedView({ value }: { value: unknown }) {
  const result = a2uiSurfaceSchema.safeParse(value);
  if (!result.success)
    return <Details title="Saved view could not be decoded" value={result.error.issues} />;
  return (
    <section className="my-4">
      <h3 className="mb-2 text-lg font-medium">Saved interactive view</h3>
      <ClioA2UISurface
        surface={result.data}
        onRemoteAction={async () => {
          throw new Error('This archive is read-only. Open a live session to ask the agent.');
        }}
      />
    </section>
  );
}

function sourceLink(uri: string | undefined): string | undefined {
  if (!uri?.startsWith('artifact://')) return uri;
  const id = uri.slice('artifact://'.length).split('/')[0];
  return data.manifest.artifacts.find((item) => item.artifact_id === id)?.archive_path ?? undefined;
}

export function Review() {
  useA2uiSessionRegistry(ids);
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6 text-foreground">
      <header className="rounded-2xl border bg-muted/30 p-6">
        <p className="mb-2 text-sm font-medium text-muted-foreground">
          {vocab.product} · Session transcript
        </p>
        <h1 className="text-3xl font-semibold">{data.transcript.session.title}</h1>
        <p className="mt-2 text-muted-foreground">
          Offline {data.manifest.mode} review ·{' '}
          <time dateTime={data.transcript.exported_at}>
            {new Date(data.transcript.exported_at).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </time>
        </p>
        <p className="mt-2">
          You can inspect views, select data, enlarge images and read the recorded work. Agent
          actions require a live session.
        </p>
        <nav aria-label="Archive sections" className="mt-5 flex flex-wrap gap-4 text-sm">
          {rows.map((row) => (
            <a key={row.session.id} className="underline" href={`#${row.session.id}`}>
              {row.session.title} · {row.messages.length} messages
            </a>
          ))}
          <a className="underline" href="#included-files">
            Included files
          </a>
        </nav>
        <p className="mt-2">
          <a href="transcript.json" className="underline">
            Raw transcript
          </a>{' '}
          ·{' '}
          <a href="manifest.json" className="underline">
            File manifest
          </a>
        </p>
      </header>
      <Details
        title="Export coverage"
        value={{ omissions: data.manifest.omissions, visualDependencies: data.snapshot.failures }}
      />
      {rows.map((row) => (
        <section id={row.session.id} key={row.session.id} className="space-y-5">
          <h2 className="text-2xl font-semibold">{row.session.title}</h2>
          <Details title="Recording coverage" value={row.recording} />
          <A2uiReferenceSessionProvider value={row.session.id}>
            {row.messages.map((message) =>
              message.parts.some(
                (part) => (part.type === 'text' && part.text?.trim()) || part.type === 'image',
              ) ||
              (data.snapshot.sessions[row.session.id] ?? []).some(
                (value) => (value as { message_id?: string }).message_id === message.id,
              ) ? (
                <article key={message.id} className="rounded-xl border p-4">
                  <h3 className="mb-3 font-medium capitalize">{message.role}</h3>
                  {message.parts
                    .filter((part) => part.type === 'text')
                    .map((part, i) => (
                      <GroundedMessageResponse
                        key={i}
                        components={{
                          a: ({ href, children }) => {
                            const target = sourceLink(href);
                            return target ? (
                              <a href={target} className="underline">
                                {children}
                              </a>
                            ) : (
                              <span>{children} (editable file requires an Effects export)</span>
                            );
                          },
                          img: ({ src, alt }) =>
                            typeof src === 'string' && src.startsWith(ARTIFACT_IMAGE_PATH) ? (
                              <A2uiMedia
                                componentId={`archive-image-${i}`}
                                kind="image"
                                url={decodeURIComponent(src.slice(ARTIFACT_IMAGE_PATH.length))}
                                label={alt}
                                objectFit="contain"
                              />
                            ) : (
                              <span>External image: {alt}</span>
                            ),
                        }}
                      >
                        {part.text ?? ''}
                      </GroundedMessageResponse>
                    ))}
                  {message.parts
                    .filter((part) => part.type === 'image' && part.url)
                    .map((part, i) => (
                      <A2uiMedia
                        key={`image-${i}`}
                        componentId={`archive-${message.id}-${i}`}
                        kind="image"
                        url={part.url!}
                        objectFit="contain"
                      />
                    ))}
                  {(data.snapshot.sessions[row.session.id] ?? [])
                    .filter((value) => (value as { message_id?: string }).message_id === message.id)
                    .map((value, i) => (
                      <SavedView key={i} value={value} />
                    ))}
                  <Details title="Recorded message parts" value={message} />
                </article>
              ) : (
                <Details
                  key={message.id}
                  title={`${message.role} activity · ${message.parts.length} recorded parts`}
                  value={message}
                />
              ),
            )}
            {(data.snapshot.sessions[row.session.id] ?? [])
              .filter(
                (value) =>
                  !row.messages.some(
                    (message) => message.id === (value as { message_id?: string }).message_id,
                  ),
              )
              .map((value, i) => (
                <SavedView key={i} value={value} />
              ))}
          </A2uiReferenceSessionProvider>
          <details className="rounded-xl border p-4">
            <summary className="cursor-pointer text-xl font-medium">
              Tools · {row.tool_records.length} complete records
            </summary>
            {row.tool_records.map((tool) => (
              <Details
                key={tool.call_id}
                title={`${tool.tool ?? 'Tool'} · ${tool.call_id}`}
                value={tool}
              />
            ))}
          </details>
          <details className="rounded-xl border p-4">
            <summary className="cursor-pointer text-xl font-medium">
              Loaded skills · {row.loaded_skills.length} recorded loads
            </summary>
            {row.loaded_skills.map((skill) => (
              <RecordedSkill key={skill.event_id} skill={skill} />
            ))}
          </details>
        </section>
      ))}
      <section id="included-files">
        <h2 className="text-2xl font-semibold">Included files</h2>
        <ArchiveFileList files={data.manifest.files} />
      </section>
    </main>
  );
}

async function mountReview(): Promise<void> {
  const encoded = window.CLIO_EXPORT_DATA;
  // Older prepared archives used an inline JSON data element. Preserve that
  // contract when a new UI is connected to a service awaiting upgrade.
  const decoded = encoded
    ? await new Response(
        new Blob([Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))])
          .stream()
          .pipeThrough(new DecompressionStream('gzip')),
      ).text()
    : document.getElementById('clio-export-data')?.textContent;
  if (!decoded) throw new Error('The archive review data is missing.');
  data = JSON.parse(decoded) as ArchiveData;
  repository = new ClioRepository(new ArchiveTransport(data.snapshot));
  rows = [data.transcript, ...data.transcript.children];
  ids = rows.map((row) => row.session.id);
  document.documentElement.classList.remove('dark');
  createRoot(document.getElementById('root')!).render(
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
    </QueryClientProvider>,
  );
}
void mountReview().catch((error: unknown) => {
  document.getElementById('root')!.textContent =
    `This browser could not open the visual review: ${error instanceof Error ? error.message : String(error)}. The raw transcript and manifest remain available beside index.html.`;
});
