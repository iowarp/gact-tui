import { createMermaidPlugin } from '@streamdown/mermaid';
import { AlertTriangleIcon, Code2Icon, EyeIcon, WorkflowIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Streamdown } from 'streamdown';
import {
  Artifact,
  ArtifactActions,
  ArtifactContent,
  ArtifactHeader,
  ArtifactTitle,
} from '@/components/ai-elements/artifact';
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { validateMermaidSource } from './mermaid-security';

const mermaid = createMermaidPlugin({
  config: {
    startOnLoad: false,
    securityLevel: 'strict',
    htmlLabels: false,
    theme: 'base',
    themeVariables: {
      background: 'transparent',
      primaryColor: '#17343b',
      primaryBorderColor: '#55c9db',
      primaryTextColor: '#e8f7f8',
      lineColor: '#6e8d94',
      secondaryColor: '#2b261d',
      tertiaryColor: '#17232a',
      fontFamily: 'Inter, Segoe UI, sans-serif',
    },
  },
});

type MermaidView = 'render' | 'source';

/** A Streamdown-backed Mermaid viewer with its native copy, export, fullscreen, and pan/zoom tools. */
export function ClioMermaidDiagram({ source, title }: { source: string; title?: string }) {
  const [view, setView] = useState<MermaidView>('render');
  const validationError = useMemo(() => {
    try {
      validateMermaidSource(source);
      return '';
    } catch (reason) {
      return reason instanceof Error ? reason.message : 'Diagram could not be rendered';
    }
  }, [source]);

  return (
    <Artifact className="rounded-xl bg-card/80 shadow-none">
      <ArtifactHeader className="gap-3 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <WorkflowIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
          <ArtifactTitle className="truncate">{title || 'Diagram'}</ArtifactTitle>
        </div>
        <ArtifactActions>
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
        </ArtifactActions>
      </ArtifactHeader>
      <ArtifactContent className="min-h-52 p-0">
        {validationError ? (
          <div className="flex min-h-52 items-center justify-center gap-2 p-4 text-sm text-destructive">
            <AlertTriangleIcon aria-hidden="true" className="size-4 shrink-0" />
            {validationError}
          </div>
        ) : view === 'source' ? (
          <CodeBlock className="min-h-52 rounded-none border-0" code={source} language="mermaid">
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
          <Streamdown
            className="min-h-52 p-4 [&>div]:my-0"
            controls={{
              mermaid: { copy: true, download: true, fullscreen: true, panZoom: true },
            }}
            mermaid={{
              config: {
                securityLevel: 'strict',
                htmlLabels: false,
              },
            }}
            plugins={{ mermaid }}
          >
            {`\`\`\`mermaid\n${source}\n\`\`\``}
          </Streamdown>
        )}
      </ArtifactContent>
    </Artifact>
  );
}
