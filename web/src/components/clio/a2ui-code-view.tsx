import type { BundledLanguage } from 'shiki';
import { FileCode2Icon } from 'lucide-react';
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block';
import { a2uiAccessibilityProps, type A2UIAccessibility } from './a2ui-accessibility';

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

function codeLanguage(value: string): BundledLanguage {
  return LANGUAGE_ALIASES[value.trim().toLowerCase()] ?? ('text' as BundledLanguage);
}

/** Lazily loaded syntax-highlighted view for code-bearing A2UI components. */
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
  return (
    <CodeBlock
      {...a2uiAccessibilityProps(accessibility)}
      code={code}
      language={codeLanguage(language)}
      showLineNumbers
    >
      <CodeBlockHeader>
        <CodeBlockTitle>
          <FileCode2Icon aria-hidden="true" className="size-3.5" />
          <CodeBlockFilename>{title || language}</CodeBlockFilename>
        </CodeBlockTitle>
        <CodeBlockActions>
          <CodeBlockCopyButton aria-label="Copy code" />
        </CodeBlockActions>
      </CodeBlockHeader>
    </CodeBlock>
  );
}
