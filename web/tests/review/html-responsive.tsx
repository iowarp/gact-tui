import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import '../../src/index.css';
import { HtmlPreview } from '../../src/components/clio/html-file-preview';
import { HtmlRendererFrame } from '../../src/components/clio/desktop-html-frame';
import { ImageResourceView } from '../../src/components/clio/image-resource-view';
import { interactiveHtmlDocument } from '../../src/components/clio/html-interactive-policy';
import desktopConfig from '../../../desktop/src-tauri/tauri.conf.json';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArchiveConnectionProvider } from '../../src/providers/connection-provider';
import { A2uiReferenceSessionProvider } from '../../src/lib/a2ui/reference-session';
import { A2uiMedia } from '../../src/components/clio/a2ui-media';
import { queryKeys } from '../../src/lib/query-keys';
import { RepositoryOverride } from '../../src/providers/repository-override-context';
import { createRepository } from '../../src/lib/connection';
import type { A2UISurface } from '@clio/core/v3';
import { ClioA2UISurface } from '../../src/components/clio/a2ui-surface';
import { A2uiSessionRegistryOwner } from '../../src/test-fixtures/a2ui/v0_9_1/test-harness';

declare global {
  interface Window {
    clioHtmlSvgLive?: {
      endpoint: string;
      runs: { model: string; session_id: string; artifact_id: string; surface: A2UISurface }[];
    };
  }
}
const live = window.clioHtmlSvgLive;
const liveRepository = live ? createRepository({ endpoint: live.endpoint }) : undefined;
const liveClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const content = `<style>
  body { margin: 16px; } h2 { margin: 0 0 12px; font-size: 22px; }
  button,input { padding: 8px 12px; } .controls { display: flex; gap: 8px; flex-wrap: wrap; }
  #extra { height: 420px; margin-top: 16px; background: var(--muted); border: 1px solid var(--border); }
  svg { width: 100%; height: auto; display: block; margin-top: 12px; }
</style><h2>Sea conditions</h2><p>Authored HTML and SVG use CLIO's colors, fonts and controls.</p>
<div class="controls"><button id="count">Observations: 0</button><button id="expand">Show details</button><input aria-label="Location" value="Pacific coast"></div>
<svg viewBox="0 0 680 110" role="img" aria-label="Wave diagram"><path fill="var(--primary)" d="M0 70 Q85 0 170 70 T340 70 T510 70 T680 70 V110 H0Z"/><text x="16" y="30" fill="currentColor">Theme-aware SVG</text></svg>
<div id="extra" hidden>More observations</div><script>
  let count=0; document.querySelector('#count').onclick=()=>document.querySelector('#count').textContent='Observations: '+(++count);
  document.querySelector('#expand').onclick=()=>{const extra=document.querySelector('#extra'); extra.hidden=!extra.hidden; document.querySelector('#expand').textContent=extra.hidden?'Show details':'Hide details';};
  window.renderIdentity = crypto.randomUUID();
</script>`;
const svg = new TextEncoder().encode(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 180"><rect fill="var(--background)" width="680" height="180"/><path fill="var(--primary)" d="M0 110 Q85 20 170 110 T340 110 T510 110 T680 110 V180 H0Z"/><text x="24" y="40" fill="currentColor" font-size="22">Standalone SVG · same CLIO tokens</text></svg>`,
);
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
});
client.setQueryData(
  queryKeys.key('a2ui-reference', 'https://archive.invalid', 'html-svg-review', 'artifact_svg'),
  {
    uri: 'artifact_svg',
    kind: 'artifact',
    workspace_id: 'html-svg-review',
    name: 'waves.svg',
    media_type: 'image/svg+xml',
    size_bytes: svg.length,
    artifact_id: 'artifact_svg',
    fetch_path: '/svg-review-bytes',
  },
);
client.setQueryData(
  queryKeys.key('a2ui-reference-bytes', 'https://archive.invalid', 'artifact', '/svg-review-bytes'),
  svg,
);

function IndependentFrame() {
  const [html, setHtml] = useState('');
  useEffect(() => {
    const policy = document.createElement('meta');
    policy.httpEquiv = 'Content-Security-Policy';
    policy.content = desktopConfig.app.security.csp;
    document.head.append(policy);
    void interactiveHtmlDocument(content).then(setHtml);
    return () => policy.remove();
  }, []);
  return html ? (
    <HtmlRendererFrame name="sea.html" html={html} url="http://127.0.0.1:8198/v1/html-renderer" />
  ) : (
    <p>Preparing…</p>
  );
}

function Review() {
  const [dark, setDark] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [paragraphs, setParagraphs] = useState(1);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <div className="mb-5 flex gap-4">
        <button onClick={() => setDark(!dark)}>Toggle theme</button>
        <button onClick={() => setNarrow(!narrow)}>Toggle width</button>
        <button onClick={() => setParagraphs(paragraphs + 1)}>Append content</button>
        <button onClick={() => setVisible(!visible)}>Reopen previews</button>
      </div>
      <div
        id="previews"
        style={{ width: narrow ? 340 : 760, maxWidth: '100%' }}
        className="space-y-5"
      >
        {visible ? (
          <>
            <section id="interactive" className="rounded-lg border bg-card">
              {location.search.includes('desktop-policy') ? (
                <IndependentFrame />
              ) : (
                <HtmlPreview name="sea.html" content={content} />
              )}
            </section>
            <section id="static" className="rounded-lg border bg-card">
              <HtmlPreview
                name="notes.html"
                content={Array.from(
                  { length: paragraphs },
                  (_, i) =>
                    `<p>Observation ${i + 1}: The wave diagram grows with its content and wraps at narrower widths.</p>`,
                ).join('')}
              />
            </section>
            <section id="svg" className="h-60 rounded-lg border bg-card">
              <ImageResourceView bytes={svg} mediaType="image/svg+xml" name="waves.svg" />
            </section>
            <section id="inline-svg" className="rounded-lg border bg-card p-4">
              <p className="mb-3 text-sm text-muted-foreground">
                Seeded figure in the production inline Image renderer.
              </p>
              <QueryClientProvider client={client}>
                <ArchiveConnectionProvider>
                  <A2uiReferenceSessionProvider value="html-svg-review">
                    <A2uiMedia
                      componentId="inline-svg"
                      kind="image"
                      label="Inline wave diagram"
                      url="artifact_svg"
                    />
                  </A2uiReferenceSessionProvider>
                </ArchiveConnectionProvider>
              </QueryClientProvider>
            </section>
            {location.search.includes('viewport-case') ? (
              <>
                <section id="full-viewport" className="h-80 rounded-lg border">
                  <HtmlPreview
                    name="viewport.html"
                    content="<style>html,body{height:100%}</style><p>Full viewport with default margins</p>"
                  />
                </section>
                <div id="body-viewport" className="h-80">
                  <HtmlPreview
                    name="body-viewport.html"
                    content="<style>body{height:100vh}</style><p>Body viewport height</p>"
                  />
                </div>
                <div id="natural-viewport" className="h-[150px]">
                  <HtmlPreview
                    name="natural-viewport.html"
                    content="<div style='height:150px'>Natural content height</div>"
                  />
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </div>
      {live ? (
        <QueryClientProvider client={liveClient}>
          <ArchiveConnectionProvider>
            <RepositoryOverride.Provider value={liveRepository}>
              <div className="mt-6 grid max-w-4xl gap-6">
                {live.runs.map((run) => (
                  <section
                    key={run.session_id}
                    data-model={run.model}
                    className="rounded-lg border bg-card p-4"
                  >
                    <h2 className="mb-4 text-lg">Actual agent SVG · {run.model}</h2>
                    <A2uiSessionRegistryOwner sessionId={run.session_id}>
                      <ClioA2UISurface surface={run.surface} />
                    </A2uiSessionRegistryOwner>
                  </section>
                ))}
              </div>
            </RepositoryOverride.Provider>
          </ArchiveConnectionProvider>
        </QueryClientProvider>
      ) : null}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Review />);
