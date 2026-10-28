import {
  AlertTriangleIcon,
  Code2Icon,
  CopyIcon,
  GitBranchIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react';
import { useContext, useMemo, useState } from 'react';
import { isDarkTheme, readThemeColor, readThemeFont, useThemeKey } from '@/theme/runtime';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { RetryIcon } from '@/lib/icon-vocabulary';
import {
  CodeBlock,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block';
import type { MermaidConfig } from '@/components/mermaidcn/mermaid';
import { MermaidPreview } from '@/components/mermaidcn/mermaid-preview';
import { artifactIdFromDataUri } from './table-query-rows';
import { buildZoneReference, type DataZoneReference } from './data-zone-reference';
import { svgIntrinsicSize, svgToPngBlob } from './mermaid-export';
import { parseDiagramSource } from './mermaid-security';
import { PresentationNavigation } from './presentation-navigation';
import {
  copyTextToClipboard,
  downloadBlob,
  downloadText,
  filenameStemFromTitle,
} from './surface-export';
import { SurfaceFullScreenHost, useSurfaceFullScreen } from './surface-full-screen';
import {
  SurfaceToolbar,
  type SurfaceCapabilities,
  type SurfaceExportFormat,
} from './surface-toolbar';

type MermaidView = 'render' | 'source';

const actionReveal =
  'opacity-60 transition-opacity duration-150 [@media(hover:hover)]:pointer-events-none [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:pointer-events-auto [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:pointer-events-auto [@media(hover:hover)]:group-focus-within:opacity-100';

/** Mermaid parses colors itself, so it gets the active theme's tokens resolved to sRGB. */
function themedMermaidConfig(): MermaidConfig {
  return {
    theme: 'base',
    darkMode: isDarkTheme(),
    htmlLabels: false,
    fontFamily: readThemeFont('typeface-ui'),
    fontSize: 16,
    flowchart: { curve: 'linear', htmlLabels: false, padding: 14 },
    themeVariables: {
      background: 'transparent',
      primaryColor: readThemeColor('accent'),
      primaryBorderColor: readThemeColor('primary'),
      primaryTextColor: readThemeColor('foreground'),
      lineColor: readThemeColor('muted-foreground'),
      secondaryColor: readThemeColor('muted'),
      tertiaryColor: readThemeColor('card'),
      textColor: readThemeColor('foreground'),
    },
  };
}

/** A Pele-backed diagram with source, G0 download/copy/reference/full-screen, and an auto-fit canvas. */
export function ClioMermaidDiagram({
  accessibilityDescription,
  accessibilityLabel,
  dataUri,
  source,
  title,
  interactiveNodes,
  selectedNodeIds,
  onNodeClick,
  referenceOverride,
}: {
  accessibilityDescription?: string;
  accessibilityLabel?: string;
  /** The artifact this diagram's `source` was read from, when it has one — used only to name the diagram in exports/references, never re-fetched here. */
  dataUri?: string;
  source: string;
  title?: string;
  interactiveNodes?: readonly { id: string; label: string }[];
  selectedNodeIds?: readonly string[];
  onNodeClick?: (
    id: string,
    modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  ) => void;
  referenceOverride?: () => DataZoneReference;
}) {
  const theme = useThemeKey();
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- the theme key is the input the resolved colors depend on
  const config = useMemo(() => themedMermaidConfig(), [theme]);
  const [view, setView] = useState<MermaidView>('render');
  const [renderedSvg, setRenderedSvg] = useState('');
  const [renderedSource, setRenderedSource] = useState(source);
  const svgOutput = renderedSource === source ? renderedSvg : '';
  const [fullscreen, setFullscreen] = useSurfaceFullScreen();
  const navigation = useContext(PresentationNavigation);
  const diagram = useMemo(() => {
    try {
      return { ...parseDiagramSource(source), error: '' };
    } catch (reason) {
      return {
        source: '',
        folders: [],
        error: reason instanceof Error ? reason.message : 'Diagram could not be rendered',
      };
    }
  }, [source]);
  const validationError = diagram.error;
  const folderLinks = navigation?.onOpenFolder
    ? diagram.folders.filter((folder) => navigation.folderAvailable?.(folder.path) ?? true)
    : [];
  const openFolder = (id: string) => {
    const target = folderLinks.find((folder) => folder.id === id);
    if (target) navigation?.onOpenFolder?.(target.path);
  };

  const heading = title || 'Diagram';
  const filenameStem = filenameStemFromTitle(heading);

  const exportFormats: SurfaceExportFormat[] = [
    {
      id: 'svg',
      label: 'SVG image',
      disabled: !svgOutput,
      run: () => downloadText(svgOutput, 'image/svg+xml', `${filenameStem}.svg`),
    },
    {
      id: 'png',
      label: 'PNG image',
      disabled: !svgOutput,
      run: async () => {
        const size = svgIntrinsicSize(svgOutput);
        if (!size) return;
        downloadBlob(await svgToPngBlob(svgOutput, size.width, size.height), `${filenameStem}.png`);
      },
    },
    {
      id: 'source',
      label: 'Mermaid source',
      run: () => downloadText(source, 'text/vnd.mermaid', `${filenameStem}.mmd`),
    },
  ];

  const buildReference = (): DataZoneReference =>
    buildZoneReference({
      componentLabel: heading,
      datasetLabel: artifactIdFromDataUri(dataUri) ?? dataUri ?? 'inline diagram',
      filters: [],
      previewColumns: [],
      previewRows: [],
      query: dataUri ? { dataUri } : { source },
      zoneDescription: 'the whole diagram',
    });

  const toolbarCapabilities: SurfaceCapabilities = {
    buildReference: referenceOverride ?? buildReference,
    exportFormats,
    fullScreen: { isOpen: fullscreen, onToggle: () => setFullscreen(!fullscreen) },
  };

  const copySource = () => {
    void copyTextToClipboard(source).then((copied) => {
      if (!copied) toast.error("Couldn't copy source");
    });
  };

  const viewSwitch = (
    <div
      aria-label="Diagram view"
      className={`inline-flex shrink-0 items-center rounded-md border p-0.5 ${actionReveal}`}
      role="group"
    >
      <Button
        aria-label="Rendered diagram"
        aria-pressed={view === 'render'}
        onClick={() => setView('render')}
        size="icon-sm"
        title="Rendered diagram"
        variant={view === 'render' ? 'secondary' : 'ghost'}
      >
        <GitBranchIcon aria-hidden="true" className="size-3.5" />
      </Button>
      <Button
        aria-label="Mermaid source"
        aria-pressed={view === 'source'}
        onClick={() => setView('source')}
        size="icon-sm"
        title="Mermaid source"
        variant={view === 'source' ? 'secondary' : 'ghost'}
      >
        <Code2Icon aria-hidden="true" className="size-3.5" />
      </Button>
    </div>
  );

  const copySourceButton = (
    <Button
      aria-label="Copy source"
      className={actionReveal}
      onClick={copySource}
      size="icon-sm"
      title="Copy source"
      variant="ghost"
    >
      <CopyIcon aria-hidden="true" className="size-3.5" />
    </Button>
  );

  const header = (
    <header className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
      <h3
        className="min-w-0 flex-1 basis-full break-words text-sm font-medium @md:basis-auto"
        title={heading}
      >
        {heading}
      </h3>
      {viewSwitch}
      {copySourceButton}
      <SurfaceToolbar capabilities={toolbarCapabilities} floating={false} />
    </header>
  );

  return (
    <section
      aria-description={accessibilityDescription}
      aria-label={accessibilityLabel || heading}
      className="group @container relative min-w-0"
    >
      {view === 'source' || validationError ? header : null}
      <SurfaceFullScreenHost
        fullscreen={fullscreen}
        headerExtra={
          <>
            {viewSwitch}
            {copySourceButton}
            <SurfaceToolbar
              capabilities={{ ...toolbarCapabilities, fullScreen: undefined }}
              floating={false}
            />
          </>
        }
        onOpenChange={setFullscreen}
        title={heading}
      >
        <div className={fullscreen ? 'min-h-0 flex-1' : undefined}>
          {validationError ? (
            <div className="flex min-h-64 items-center justify-center gap-2 p-4 text-sm text-destructive">
              <AlertTriangleIcon aria-hidden="true" className="size-4 shrink-0" />
              {validationError}
            </div>
          ) : view === 'source' ? (
            <CodeBlock
              className={fullscreen ? 'h-full' : 'min-h-72'}
              code={source}
              language="mermaid"
            >
              <CodeBlockHeader>
                <CodeBlockTitle>
                  <CodeBlockFilename>Mermaid source</CodeBlockFilename>
                </CodeBlockTitle>
              </CodeBlockHeader>
            </CodeBlock>
          ) : (
            <MermaidPreview
              chart={diagram.source}
              className={fullscreen ? 'h-full' : undefined}
              autoHeight={!fullscreen}
              config={config}
              controls={({ zoomIn, zoomOut, centerView, scalePercent }) => (
                <header className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
                  {!fullscreen ? (
                    <h3
                      className="min-w-0 flex-1 basis-full break-words text-sm font-medium @md:basis-auto"
                      title={heading}
                    >
                      {heading}
                    </h3>
                  ) : (
                    <span className="flex-1" />
                  )}
                  {!fullscreen ? (
                    <>
                      {viewSwitch}
                      {copySourceButton}
                    </>
                  ) : null}
                  <div className={`flex shrink-0 items-center gap-0.5 ${actionReveal}`}>
                    <Button
                      aria-label="Zoom out"
                      disabled={!svgOutput}
                      onClick={zoomOut}
                      size="icon-sm"
                      title="Zoom out. Scroll over the diagram to zoom, drag to pan"
                      variant="ghost"
                    >
                      <ZoomOutIcon aria-hidden="true" className="size-3.5" />
                    </Button>
                    <span className="min-w-9 text-center text-[11px] tabular-nums text-muted-foreground">
                      {scalePercent}%
                    </span>
                    <Button
                      aria-label="Zoom in"
                      disabled={!svgOutput}
                      onClick={zoomIn}
                      size="icon-sm"
                      title="Zoom in. Scroll over the diagram to zoom, drag to pan"
                      variant="ghost"
                    >
                      <ZoomInIcon aria-hidden="true" className="size-3.5" />
                    </Button>
                    <Button
                      aria-label="Reset zoom"
                      disabled={!svgOutput}
                      onClick={centerView}
                      size="icon-sm"
                      title="Reset zoom"
                      variant="ghost"
                    >
                      <RetryIcon aria-hidden="true" className="size-3.5" />
                    </Button>
                  </div>
                  {!fullscreen ? (
                    <SurfaceToolbar capabilities={toolbarCapabilities} floating={false} />
                  ) : null}
                </header>
              )}
              onSvgOutputChange={(svg) => {
                setRenderedSvg(svg);
                setRenderedSource(source);
              }}
              interactiveNodes={interactiveNodes ?? folderLinks}
              selectedNodeIds={selectedNodeIds}
              onNodeClick={onNodeClick ?? openFolder}
              svgOutput={svgOutput}
            />
          )}
        </div>
      </SurfaceFullScreenHost>
      {folderLinks.length ? (
        <div className="sr-only focus-within:not-sr-only">
          <p>Diagram folders</p>
          {folderLinks.map((folder) => (
            <Button key={folder.id} variant="link" onClick={() => openFolder(folder.id)}>
              {folder.label}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
