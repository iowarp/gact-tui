import {
  AlertTriangleIcon,
  Code2Icon,
  EyeIcon,
  Maximize2Icon,
  Minimize2Icon,
  WorkflowIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block';
import type { MermaidConfig } from '@/components/mermaidcn/mermaid';
import { MermaidPreview } from '@/components/mermaidcn/mermaid-preview';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { validateMermaidSource } from './mermaid-security';

type MermaidView = 'render' | 'source';

const config: MermaidConfig = {
  theme: 'base',
  darkMode: true,
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

/** A MermaidCN-backed diagram with source, export, fullscreen, and auto-fit canvas controls. */
export function ClioMermaidDiagram({ source, title }: { source: string; title?: string }) {
  const [view, setView] = useState<MermaidView>('render');
  const [svgOutput, setSvgOutput] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const validationError = useMemo(() => {
    try {
      validateMermaidSource(source);
      return '';
    } catch (reason) {
      return reason instanceof Error ? reason.message : 'Diagram could not be rendered';
    }
  }, [source]);

  const content = (
    <section
      aria-label={title || 'Diagram'}
      className={fullscreen ? 'flex min-h-0 min-w-0 flex-1 flex-col bg-card' : 'min-w-0 bg-card'}
    >
      <header className="flex items-center justify-between gap-3 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <WorkflowIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
          <h3 className="truncate text-sm font-medium">{title || 'Diagram'}</h3>
        </div>
        <div className="flex items-center gap-1">
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
          <Button
            aria-label={fullscreen ? 'Exit diagram fullscreen' : 'View diagram fullscreen'}
            onClick={() => setFullscreen((current) => !current)}
            size="icon-sm"
            title={fullscreen ? 'Exit fullscreen' : 'View fullscreen'}
            variant="ghost"
          >
            {fullscreen ? (
              <Minimize2Icon aria-hidden="true" />
            ) : (
              <Maximize2Icon aria-hidden="true" />
            )}
          </Button>
        </div>
      </header>
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
              <CodeBlockActions>
                <CodeBlockCopyButton aria-label="Copy Mermaid source" />
              </CodeBlockActions>
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
    </section>
  );

  return (
    <>
      {fullscreen ? null : content}
      <Dialog onOpenChange={setFullscreen} open={fullscreen}>
        <DialogContent
          aria-describedby={undefined}
          className="flex h-[calc(100vh-1rem)] w-[calc(100vw-1rem)] max-w-none flex-col gap-0 overflow-hidden rounded-lg p-4 sm:max-w-none"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">{title || 'Diagram'}</DialogTitle>
          {fullscreen ? content : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
