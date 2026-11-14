import {
  AlertTriangleIcon,
  Code2Icon,
  CopyIcon,
  FileCodeIcon,
  GitBranchIcon,
  ImageIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react';
import { useCallback, useContext, useEffect, useId, useMemo, useState } from 'react';
import {
  interfaceScale,
  isDarkTheme,
  readThemeColor,
  readThemeFont,
  useInterfaceScale,
  useThemeKey,
} from '@/theme/runtime';
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
import {
  useFileViewerActions,
  useFileViewerContentsRegistry,
  type FileViewerAction,
} from './file-viewer-action-context';
import { useFileViewerFacts } from './file-viewer-facts';
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
import { ViewerZoomControls } from './viewer-zoom-controls';
import { t } from '@lingui/core/macro';

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
    fontSize: 16 * interfaceScale(),
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

/** SVG, PNG and the source; the images wait for the diagram to render. */
function mermaidExports(svg: string, source: string, stem: string): SurfaceExportFormat[] {
  return [
    {
      id: 'svg',
      label: t`SVG image`,
      disabled: !svg,
      run: () => downloadText(svg, 'image/svg+xml', `${stem}.svg`),
    },
    {
      id: 'png',
      label: t`PNG image`,
      disabled: !svg,
      run: async () => {
        const size = svgIntrinsicSize(svg);
        if (!size) return;
        downloadBlob(await svgToPngBlob(svg, size.width, size.height), `${stem}.png`);
      },
    },
    {
      id: 'source',
      label: t`Mermaid source`,
      run: () => downloadText(source, 'text/vnd.mermaid', `${stem}.mmd`),
    },
  ];
}

/**
 * A Pele-backed diagram with source, G0 download/copy/reference/full-screen, and an auto-fit canvas.
 *
 * `framed` makes it the whole of a file viewer (a .mmd file): inside the
 * workbench frame its zoom icons go to Format, its exports to Open's Export
 * to…, and Copy copies the source, so it draws no header of its own.
 */
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
  framed = false,
}: {
  framed?: boolean;
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
  const scale = useInterfaceScale();
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- the theme key and interface scale are the inputs the resolved config depends on
  const config = useMemo(() => themedMermaidConfig(), [theme, scale]);
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
        error: reason instanceof Error ? reason.message : t`Diagram could not be rendered`,
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

  const heading = title || t`Diagram`;
  const filenameStem = filenameStemFromTitle(heading);

  const exportFormats = mermaidExports(svgOutput, source, filenameStem);
  const registerContents = useFileViewerContentsRegistry();
  const contentsId = useId();
  const inFrame = framed && registerContents !== undefined;
  const frameDownloads = useMemo<FileViewerAction[]>(
    () =>
      inFrame
        ? mermaidExports(svgOutput, source, filenameStem).map((format) => ({
            label: format.label,
            kind: 'download',
            icon: format.id === 'png' ? ImageIcon : FileCodeIcon,
            disabled: format.disabled,
            onSelect: format.run,
          }))
        : [],
    [filenameStem, inFrame, source, svgOutput],
  );
  useFileViewerActions(frameDownloads);
  const readSource = useCallback(() => source, [source]);
  useEffect(() => {
    if (!inFrame) return;
    registerContents?.(contentsId, readSource);
    return () => registerContents?.(contentsId);
  }, [contentsId, inFrame, readSource, registerContents]);

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
      if (!copied) toast.error(t`Couldn't copy source`);
    });
  };

  const viewSwitch = (
    <div
      aria-label={t`Diagram view`}
      className={`inline-flex shrink-0 items-center rounded-md border p-0.5 ${actionReveal}`}
      role="group"
    >
      <Button
        aria-label={t`Rendered diagram`}
        aria-pressed={view === 'render'}
        onClick={() => setView('render')}
        size="icon-sm"
        title={t`Rendered diagram`}
        variant={view === 'render' ? 'secondary' : 'ghost'}
      >
        <GitBranchIcon aria-hidden="true" className="size-3.5" />
      </Button>
      <Button
        aria-label={t`Mermaid source`}
        aria-pressed={view === 'source'}
        onClick={() => setView('source')}
        size="icon-sm"
        title={t`Mermaid source`}
        variant={view === 'source' ? 'secondary' : 'ghost'}
      >
        <Code2Icon aria-hidden="true" className="size-3.5" />
      </Button>
    </div>
  );

  const copySourceButton = (
    <Button
      aria-label={t`Copy source`}
      className={actionReveal}
      onClick={copySource}
      size="icon-sm"
      title={t`Copy source`}
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

  const folderButtons = folderLinks.length ? (
    <div className="sr-only focus-within:not-sr-only">
      <p>{t`Diagram folders`}</p>
      {folderLinks.map((folder) => (
        <Button key={folder.id} variant="link" onClick={() => openFolder(folder.id)}>
          {folder.label}
        </Button>
      ))}
    </div>
  ) : null;

  const diagramError = (
    <div className="flex min-h-64 items-center justify-center gap-2 p-4 text-sm text-destructive">
      <AlertTriangleIcon aria-hidden="true" className="size-4 shrink-0" />
      {validationError}
    </div>
  );

  if (inFrame) {
    return (
      <section
        aria-description={accessibilityDescription}
        aria-label={accessibilityLabel || heading}
        className="flex h-full min-h-0 min-w-0 flex-col"
        data-slot="mermaid-diagram"
      >
        {validationError ? (
          diagramError
        ) : (
          <MermaidPreview
            chart={diagram.source}
            className="min-h-0 flex-1"
            config={config}
            controls={({ zoomIn, zoomOut, centerView, scalePercent, fitted }) => (
              <FramedZoom
                disabled={!svgOutput}
                fitted={fitted}
                onIn={zoomIn}
                onOut={zoomOut}
                onReset={centerView}
                percent={scalePercent}
              />
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
        {folderButtons}
      </section>
    );
  }

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
            diagramError
          ) : view === 'source' ? (
            <CodeBlock
              className={fullscreen ? 'h-full' : 'min-h-72'}
              code={source}
              language="mermaid"
            >
              <CodeBlockHeader>
                <CodeBlockTitle>
                  <CodeBlockFilename>{t`Mermaid source`}</CodeBlockFilename>
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
                      aria-label={t`Zoom out`}
                      disabled={!svgOutput}
                      onClick={zoomOut}
                      size="icon-sm"
                      title={t`Zoom out. Scroll over the diagram to zoom, drag to pan`}
                      variant="ghost"
                    >
                      <ZoomOutIcon aria-hidden="true" className="size-3.5" />
                    </Button>
                    <span className="min-w-9 text-center text-caption tabular-nums text-muted-foreground">
                      {scalePercent}%
                    </span>
                    <Button
                      aria-label={t`Zoom in`}
                      disabled={!svgOutput}
                      onClick={zoomIn}
                      size="icon-sm"
                      title={t`Zoom in. Scroll over the diagram to zoom, drag to pan`}
                      variant="ghost"
                    >
                      <ZoomInIcon aria-hidden="true" className="size-3.5" />
                    </Button>
                    <Button
                      aria-label={t`Reset zoom`}
                      disabled={!svgOutput}
                      onClick={centerView}
                      size="icon-sm"
                      title={t`Reset zoom`}
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
      {folderButtons}
    </section>
  );
}

/**
 * The framed diagram's Format: zoom out and zoom in. A zoom off the fitted
 * view is a fact, which folds before any control does. Wheel or pinch zooms,
 * dragging pans and 0 fits the diagram.
 */
function FramedZoom({
  percent,
  fitted,
  onIn,
  onOut,
  onReset,
  disabled,
}: {
  percent: number;
  fitted: boolean;
  onIn: () => void;
  onOut: () => void;
  onReset: () => void;
  disabled: boolean;
}) {
  useFileViewerFacts(disabled || fitted ? undefined : [`${Math.round(percent)}%`]);
  return (
    <ViewerZoomControls
      label={t`Diagram zoom`}
      onIn={onIn}
      onOut={onOut}
      onReset={disabled ? undefined : onReset}
      disabledIn={disabled}
      disabledOut={disabled}
    />
  );
}
