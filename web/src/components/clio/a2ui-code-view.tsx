import type { BundledLanguage } from 'shiki';
import { FileCode2Icon } from 'lucide-react';
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block';
import { a2uiAccessibilityProps, type A2UIAccessibility } from './a2ui-accessibility';
import { buildZoneReference, type DataZoneReference } from './data-zone-reference';
import { copyTextToClipboard, downloadText, filenameStemFromTitle } from './surface-export';
import { SurfaceFullScreenHost, useSurfaceFullScreen } from './surface-full-screen';
import { SurfaceToolbar, type SurfaceCapabilities } from './surface-toolbar';

const LANGUAGE_ALIASES: Record<string, BundledLanguage> = {
  py: 'python',
  python: 'python',
  js: 'javascript',
  javascript: 'javascript',
  ts: 'typescript',
  typescript: 'typescript',
  tsx: 'tsx',
  jsx: 'jsx',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  bash: 'bash',
  shell: 'shellscript',
  sh: 'shellscript',
  rust: 'rust',
  go: 'go',
  sql: 'sql',
  markdown: 'markdown',
  md: 'markdown',
  diff: 'diff',
  text: 'text' as BundledLanguage,
  txt: 'text' as BundledLanguage,
};

/** A download's file extension for a known language, else the language name itself. */
const FILE_EXTENSIONS: Record<string, string> = {
  bash: 'sh',
  diff: 'diff',
  go: 'go',
  javascript: 'js',
  json: 'json',
  jsx: 'jsx',
  markdown: 'md',
  python: 'py',
  rust: 'rs',
  shellscript: 'sh',
  sql: 'sql',
  text: 'txt',
  tsx: 'tsx',
  typescript: 'ts',
  yaml: 'yaml',
};

function codeLanguage(value: string): BundledLanguage {
  return LANGUAGE_ALIASES[value.trim().toLowerCase()] ?? ('text' as BundledLanguage);
}

function fileExtension(language: string): string {
  return FILE_EXTENSIONS[codeLanguage(language)] ?? 'txt';
}

/**
 * Lazily loaded syntax-highlighted view for code-bearing A2UI components
 * (`clio.code.v1` AND `clio.diff.v1` — both render through this one view,
 * `kernel-catalog.tsx`'s `RenderedCode`/`ClioDiffView`, so both inherit every
 * affordance added here with no further wiring).
 *
 * G0 row: "copy; download the file or patch; full screen; Reference this (a
 * selected line range)." A selected-range reference is not implemented here
 * (no line-selection UI exists yet) — `buildReference` describes the WHOLE
 * file/diff instead, a still-honest, non-degenerate default.
 */
export function ClioA2UICodeView({
  accessibility,
  code,
  language,
  title,
}: {
  accessibility?: A2UIAccessibility;
  code: string;
  language: string;
  title?: string;
}) {
  const [fullscreen, setFullscreen] = useSurfaceFullScreen();
  const heading = title || language;
  const filenameStem = filenameStemFromTitle(heading);

  const buildReference = (): DataZoneReference =>
    buildZoneReference({
      componentLabel: heading,
      datasetLabel: language,
      filters: [],
      previewColumns: [],
      previewRows: [],
      query: { code, language },
      zoneDescription: `the whole ${language === 'diff' ? 'diff' : 'file'} (${code.split('\n').length.toLocaleString()} lines)`,
    });

  const capabilities: SurfaceCapabilities = {
    buildReference,
    exportFormats: [
      {
        id: 'file',
        label: language === 'diff' ? 'Patch file' : 'Source file',
        run: () => downloadText(code, 'text/plain', `${filenameStem}.${fileExtension(language)}`),
      },
    ],
    fullScreen: { isOpen: fullscreen, onToggle: () => setFullscreen(!fullscreen) },
    onCopy: async () => {
      await copyTextToClipboard(code);
    },
  };

  return (
    <SurfaceFullScreenHost fullscreen={fullscreen} onOpenChange={setFullscreen} title={heading}>
      <CodeBlock
        {...a2uiAccessibilityProps(accessibility)}
        className={fullscreen ? 'flex h-full flex-col [&>div:last-child]:min-h-0 [&>div:last-child]:flex-1' : undefined}
        code={code}
        language={codeLanguage(language)}
        showLineNumbers
      >
        <CodeBlockHeader>
          <CodeBlockTitle>
            <FileCode2Icon aria-hidden="true" className="size-3.5" />
            <CodeBlockFilename>{heading}</CodeBlockFilename>
          </CodeBlockTitle>
          <CodeBlockActions>
            <SurfaceToolbar capabilities={capabilities} />
          </CodeBlockActions>
        </CodeBlockHeader>
      </CodeBlock>
    </SurfaceFullScreenHost>
  );
}
