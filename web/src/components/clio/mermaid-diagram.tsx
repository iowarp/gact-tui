import { AlertTriangleIcon, Code2Icon, EyeIcon, WorkflowIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  CodeBlock,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block';
import type { MermaidConfig } from '@/components/mermaidcn/mermaid';
import { MermaidPreview } from '@/components/mermaidcn/mermaid-preview';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { artifactIdFromDataUri } from './table-query-rows';
import { buildZoneReference, type DataZoneReference } from './data-zone-reference';
import { svgIntrinsicSize, svgToPngBlob } from './mermaid-export';
import { validateMermaidSource } from './mermaid-security';
import { copyTextToClipboard, downloadBlob, downloadText, filenameStemFromTitle } from './surface-export';
import { SurfaceFullScreenHost, useSurfaceFullScreen } from './surface-full-screen';
import { SurfaceToolbar, type SurfaceCapabilities, type SurfaceExportFormat } from './surface-toolbar';

type MermaidView = 'render' | 'source';

const config: MermaidConfig = {
  theme: 'base',
  darkMode: true,
  htmlLabels: false,
  fontFamily: 'Inter Variable, Segoe UI, sans-serif',
  fontSize: 16,
  flowchart: { curve: 'linear', htmlLabels: false, padding: 14 },
  themeVariables: {
    background: 'transparent',
    primaryColor: '#17343b',
    primaryBorderColor: '#55c9db',
    primaryTextColor: '#e8f7f8',
    lineColor: '#6e8d94',
    secondaryColor: '#2b261d',
    tertiaryColor: '#17232a',
    textColor: '#e8f7f8',
  },
};

/** A MermaidCN-backed diagram with source, G0 download/copy/reference/full-screen, and an auto-fit canvas. */
export function ClioMermaidDiagram({
  accessibilityDescription,
  accessibilityLabel,
  dataUri,
  source,
  title,
}: {
  accessibilityDescription?: string;
  accessibilityLabel?: string;
  /** The artifact this diagram's `source` was read from, when it has one — used only to name the diagram in exports/references, never re-fetched here. */
  dataUri?: string;
  source: string;
  title?: string;
}) {
  const [view, setView] = useState<MermaidView>('render');
  const [svgOutput, setSvgOutput] = useState('');
  const [fullscreen, setFullscreen] = useSurfaceFullScreen();
  const validationError = useMemo(() => {
    try {
      validateMermaidSource(source);
      return '';
    } catch (reason) {
      return reason instanceof Error ? reason.message : 'Diagram could not be rendered';
    }
  }, [source]);

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

  // Not a G0 download/select/zoom/full-screen/reference affordance (it's the
  // diagram's own render/source view switch), so it stays in this
  // component's own header rather than the shared `SurfaceToolbar` overflow.
  const diagramHeaderExtra = (
    <ToggleGroup
      aria-label="Diagram view"
      onValueChange={(value) => {
        if (value === 'render' || value === 'source') setView(value);
      }}
      size="sm"
      spacing={0}
      type="single"
      value={view}
      variant="outline"
    >
      <ToggleGroupItem aria-label="Show rendered diagram" value="render">
        <EyeIcon aria-hidden="true" data-icon="inline-start" />
        Render
      </ToggleGroupItem>
      <ToggleGroupItem aria-label="Show Mermaid source" value="source">
        <Code2Icon aria-hidden="true" data-icon="inline-start" />
        Source
      </ToggleGroupItem>
    </ToggleGroup>
  );
  const toolbarCapabilities: SurfaceCapabilities = {
    buildReference,
    copyLabel: 'Copy source',
    exportFormats,
    fullScreen: { isOpen: fullscreen, onToggle: () => setFullscreen(!fullscreen) },
    onCopy: async () => {
      await copyTextToClipboard(source);
    },
  };

  return (
    <section
      aria-description={accessibilityDescription}
      aria-label={accessibilityLabel || heading}
      className="group relative min-w-0 bg-card"
    >
      <header className="flex items-center justify-between gap-3 pb-2 pr-36">
        <div className="flex min-w-0 items-center gap-2">
          <WorkflowIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
          <h3 className="truncate text-sm font-medium">{heading}</h3>
        </div>
        {diagramHeaderExtra}
      </header>
      <SurfaceToolbar capabilities={toolbarCapabilities} />
      <SurfaceFullScreenHost fullscreen={fullscreen} onOpenChange={setFullscreen} title={heading}>
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
              chart={source}
              className={fullscreen ? 'h-full' : 'h-72 sm:h-80'}
              config={config}
              onSvgOutputChange={setSvgOutput}
              svgOutput={svgOutput}
            />
          )}
        </div>
      </SurfaceFullScreenHost>
    </section>
  );
}
