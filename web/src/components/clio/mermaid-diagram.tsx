import { AlertTriangleIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  CodeBlock,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block';
import type { MermaidConfig } from '@/components/mermaidcn/mermaid';
import { MermaidPreview } from '@/components/mermaidcn/mermaid-preview';
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { artifactIdFromDataUri } from './table-query-rows';
import { buildZoneReference, type DataZoneReference } from './data-zone-reference';
import { svgIntrinsicSize, svgToPngBlob } from './mermaid-export';
import { validateMermaidSource } from './mermaid-security';
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

  const toolbarCapabilities: SurfaceCapabilities = {
    buildReference,
    copyLabel: 'Copy source',
    exportFormats,
    fullScreen: { isOpen: fullscreen, onToggle: () => setFullscreen(!fullscreen) },
    onCopy: () => copyTextToClipboard(source),
    overflowContent: (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>Diagram view</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup
            onValueChange={(value) => {
              if (value === 'render' || value === 'source') setView(value);
            }}
            value={view}
          >
            <DropdownMenuRadioItem value="render">Rendered diagram</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="source">Mermaid source</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    ),
  };

  return (
    <section
      aria-description={accessibilityDescription}
      aria-label={accessibilityLabel || heading}
      className="group relative min-w-0"
    >
      <header className="mb-2 flex min-w-0 items-start gap-3">
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium">{heading}</h3>
        <SurfaceToolbar capabilities={toolbarCapabilities} floating={false} />
      </header>
      <SurfaceFullScreenHost
        fullscreen={fullscreen}
        headerExtra={
          <SurfaceToolbar
            capabilities={{ ...toolbarCapabilities, fullScreen: undefined }}
            floating={false}
          />
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
